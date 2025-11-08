from flask import Flask, request, send_file, jsonify
from flask_socketio import SocketIO
import pandas as pd
import requests
import json
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

FOLDER_ID = "b1g6grqlei218ful6p26"
MODEL = "yandexgpt-lite"

# Загрузка IAM_TOKEN
try:
    with open('config.json', 'r', encoding='utf-8') as f:
        config = json.load(f)
    IAM_TOKEN = config['IAM_TOKEN']
except FileNotFoundError:
    IAM_TOKEN = os.environ.get('IAM_TOKEN')
    if not IAM_TOKEN:
        raise ValueError("IAM_TOKEN не задан в config.json или окружении")

def ask_yandex_gpt(prompt):
    url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    headers = {
        "Authorization": f"Bearer {IAM_TOKEN}",
        "x-folder-id": FOLDER_ID,
        "Content-Type": "application/json",
    }
    data = {
        "modelUri": f"gpt://{FOLDER_ID}/{MODEL}/latest",
        "completionOptions": {
            "stream": False,
            "temperature": 0.1,
            "maxTokens": 10000
        },
        "messages": [{"role": "user", "text": prompt}]
    }
    response = requests.post(url, headers=headers, json=data)
    try:
        return response.json()["result"]["alternatives"][0]["message"]["text"].strip()
    except Exception as e:
        print("Ошибка GPT:", e)
        print("Ответ:", response.text)
        return ""

def generate_prompt(row):
    q_num = row["№ вопроса"]
    if q_num in [1, 3]: min_score, max_score = 0, 1
    elif q_num in [2, 4]: min_score, max_score = 0, 2
    else: min_score, max_score = 0, 2

    question = str(row["Текст вопроса"])
    answer = str(row["Транскрибация ответа"])

    return f"""
    Ты экзаменатор по русскому языку для иностранных граждан.
    Оцени ответ по критериям:
    1. Мелкие ошибки и акцент не считаются.
    2. Ответ должен быть по существу и решать коммуникативную задачу.
    3. Предложения должны быть в основном полными.
    Вопрос: {question}
    Ответ экзаменуемого: {answer}
    Поставь оценку от {min_score} до {max_score}. Ответ — только ЦЕЛОЕ число.
    """.strip()

# Маршрут для загрузки файла
@app.route('/upload-csv', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не загружен'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400

    # Сохраняем временно
    temp_path = 'uploaded_temp.csv'
    file.save(temp_path)

    return jsonify({'status': 'uploaded', 'path': temp_path}), 200

# WebSocket для обработки
@socketio.on('process_csv')
def handle_process_csv(data):
    try:
        # Читаем сохранённый файл
        df = pd.read_csv('uploaded_temp.csv', sep=';', dtype={'№ вопроса': 'Int64'})

        valid_mask = (
            df['№ вопроса'].notna() &
            df['Текст вопроса'].notna() &
            df['Транскрибация ответа'].notna() &
            (df['Транскрибация ответа'] != '')
        )
        subset = df.loc[valid_mask, ['№ вопроса', 'Текст вопроса', 'Транскрибация ответа']].copy()

        predicted_scores = []
        total_rows = len(subset)

        for i, row in subset.iterrows():
            prompt = generate_prompt(row)
            score = ask_yandex_gpt(prompt)
            try:
                score_value = int(score)
            except (ValueError, TypeError):
                score_value = 0
            predicted_scores.append(score_value)

            # Отправляем прогресс
            progress = int((i + 1) / total_rows * 100)
            socketio.emit('progress', {'progress': progress})

        # Добавляем оценки
        df.loc[valid_mask, 'Оценка экзаменатора'] = predicted_scores
        if 'Оценка экзаменатора' in df.columns:
            df['Оценка экзаменатора'] = pd.to_numeric(
                df['Оценка экзаменатора'], errors='coerce'
            ).fillna(0).astype('Int64')

        # Сохраняем результат
        output_path = 'processed_file.csv'
        df.to_csv(output_path, sep=';', encoding='utf-8-sig', index=False, quoting=1)

        # Отправляем файл клиенту
        with open(output_path, 'rb') as f:
            file_data = f.read()
        socketio.emit('file_ready', {
            'filename': 'обработанный_файл.csv',
            'data': file_data
        })

    except Exception as e:
        socketio.emit('error', {'message': str(e)})
        print("Ошибка обработки:", e)

@app.route('/')
def index():
    return "Server is running", 200

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))

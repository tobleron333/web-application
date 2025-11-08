from flask import Flask, request
from flask_socketio import SocketIO, emit
import pandas as pd
import requests
import os
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-me'

# Важно: укажите точный домен вашего приложения
socketio = SocketIO(
    app,
    cors_allowed_origins=["https://web-application-f.onrender.com"],
    logger=True,
    engineio_logger=True
)

FOLDER_ID = "b1g6grqlei218ful6p26"
MODEL = "yandexgpt-lite"

# Получение токена из переменных окружения
IAM_TOKEN = os.environ.get('IAM_TOKEN')
if not IAM_TOKEN:
    raise ValueError("IAM_TOKEN не задан в переменных окружения")


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
    try:
        response = requests.post(url, headers=headers, json=data)
        return response.json()["result"]["alternatives"][0]["message"]["text"].strip()
    except Exception as e:
        logging.error(f"Ошибка Yandex GPT: {e}, ответ: {response.text}")
        return ""

def generate_prompt(row):
    q_num = row["№ вопроса"]
    if q_num in [1, 3]:
        min_score, max_score = 0, 1
    elif q_num in [2, 4]:
        min_score, max_score = 0, 2
    else:
        min_score, max_score = 0, 2

    question = str(row["Текст вопроса"])
    answer = str(row["Транскрибация ответа"])

    prompt = f"""
    Ты экзаменатор по русскому языку для иностранных граждан.
    Оцени ответ по критериям:
    1. Мелкие ошибки и акцент не считаются.
    2. Ответ должен быть по существу и решать коммуникативную задачу.
    3. Предложения должны быть в основном полными.
    Вопрос: {question}
    Ответ экзаменуемого: {answer}
    Поставь оценку от {min_score} до {max_score}. Ответ — только ЦЕЛОЕ число.
    """
    return prompt.strip()

@socketio.on('upload_file')
def handle_file(data):
    try:
        # 1. Сохраняем файл
        filename = data['filename']
        file_data = bytes(data['file'])
        
        TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp")
        os.makedirs(TEMP_DIR, exist_ok=True)
        temp_path = os.path.join(TEMP_DIR, filename)
        
        with open(temp_path, 'wb') as f:
            f.write(file_data)

        logging.info("Файл сохранён, отправляем прогресс 20%")
        emit('progress', {'percent': 20})


        # 2. Читаем CSV
        df = pd.read_csv(temp_path, sep=';', dtype={'№ вопроса': 'Int64'})
        logging.info("CSV прочитан, отправляем прогресс 40%")
        emit('progress', {'percent': 40})


        # 3. Обрабатываем строки
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

            # Отправляем прогресс для каждой обработанной строки
            current_percent = 40 + int(60 * (i + 1) / total_rows)
            logging.info(f"Обработана строка {i+1}/{total_rows}, прогресс: {current_percent}%")
            emit('progress', {'percent': current_percent})


        # 4. Добавляем оценки
        df.loc[valid_mask, 'Оценка экзаменатора'] = predicted_scores
        if 'Оценка экзаменатора' in df.columns:
            df['Оценка экзаменатора'] = pd.to_numeric(
                df['Оценка экзаменатора'], errors='coerce'
            ).fillna(0).astype('Int64')

        logging.info("Обработка завершена, отправляем прогресс 90%")
        emit('progress', {'percent': 90})

        # 5. Сохраняем результат
        output_path = os.path.join(TEMP_DIR, f!processed_{filename}")
        df.to_csv(output_path, sep=';', encoding='utf-8-sig', index=False, quoting=1)

        with open(output_path, 'rb') as f:
            file_bytes = f.read()

        logging.info("Файл готов, отправляем клиенту")
        emit('file_ready', {
            'filename': 'обработанный_файл.csv',
            'data': list(file_bytes)
        })

        # Очищаем временные файлы
        os.remove(temp_path)
        os.remove(output_path)

    except Exception as e:
        logging.error(f!Ошибка обработки: {e}")
        emit('error', {'message': str(e)})


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host='0.0.0.0', port=port)

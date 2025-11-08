from flask import Flask
from flask_socketio import SocketIO, emit
import pandas as pd
import requests
import os
import logging
from datetime import datetime

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key')

# SocketIO с CORS для Render
socketio = SocketIO(
    app,
    cors_allowed_origins=["https://web-application-f.onrender.com"],
    logger=True,
    engineio_logger=True
)

# Конфигурация Yandex GPT
FOLDER_ID = "b1g6grqlei218ful6p26"
MODEL = "yandexgpt-lite"
IAM_TOKEN = os.environ.get('IAM_TOKEN')

if not IAM_TOKEN:
    raise ValueError("IAM_TOKEN не задан в переменных окружения")

def ask_yandex_gpt(prompt: str) -> str:
    """Запрос к Yandex GPT с обработкой ошибок"""
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
            "maxTokens": 1000
        },
        "messages": [{"role": "user", "text": prompt}]
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        if response.status_code == 200:
            return response.json()["result"]["alternatives"][0]["message"]["text"].strip()
        else:
            logging.error(f"GPT ошибка {response.status_code}: {response.text}")
            return ""
    except Exception as e:
        logging.exception("Ошибка запроса к GPT")
        return ""

def generate_prompt(row: pd.Series) -> str:
    """Формирование промпта для оценки ответа"""
    q_num = row["№ вопроса"]
    min_score, max_score = (0, 1) if q_num in [1, 3] else (0, 2)

    return f"""Ты экзаменатор по русскому языку для иностранных граждан. Оцени ответ по критериям:
1. Мелкие ошибки и акцент не считаются.
2. Ответ должен быть по существу и решать коммуникативную задачу.
3. Предложения должны быть в основном полными.
Вопрос: {row['Текст вопроса']}
Ответ экзаменуемого: {row['Транскрибация ответа']}
Поставь оценку от {min_score} до {max_score}. Ответ — только ЦЕЛОЕ число."""

@socketio.on('upload_file')
def handle_upload(data):
    """Обработка загруженного файла"""
    try:
        filename = data['filename']
        file_data = bytes(data['file'])
        temp_dir = os.path.join(os.path.dirname(__file__), "temp")
        os.makedirs(temp_dir, exist_ok=True)
        
        # 1. Сохранение файла
        temp_path = os.path.join(temp_dir, filename)
        with open(temp_path, 'wb') as f:
            f.write(file_data)
        emit('progress', {'percent': 20})
        logging.info(f"[{filename}] Файл сохранён")

        # 2. Чтение CSV
        df = pd.read_csv(temp_path, sep=';', dtype={'№ вопроса': 'Int64'})
        emit('progress', {'percent': 40})
        logging.info(f"[{filename}] CSV прочитан")

        # 3. Фильтрация данных
        valid_mask = (
            df['№ вопроса'].notna() &
            df['Текст вопроса'].notna() &
            df['Транскрибация ответа'].notna() &
            (df['Транскрибация ответа'] != '')
        )
        subset = df.loc[valid_mask, ['№ вопроса', 'Текст вопроса', 'Транскрибация ответа']].copy()
        total_rows = len(subset)
        
        if total_rows == 0:
            emit('error', {'message': 'Нет валидных строк для обработки'})
            return

        predicted_scores = []
        
        # 4. Обработка строк с прогрессом
        for i, row in subset.iterrows():
            prompt = generate_prompt(row)
            score_text = ask_yandex_gpt(prompt)
            
            try:
                score = int(score_text)
                if score < 0 or score > 2: score = 0
            except (ValueError, TypeError):
                score = 0
                
            predicted_scores.append(score)
            
            # Плавный прогресс: 40% → 90%
            percent = 40 + int((i + 1) / total_rows * 50)
            emit('progress', {'percent': percent})
            
        # 5. Добавление оценок в DataFrame
        df.loc[valid_mask, 'Оценка экзаменатора'] = predicted_scores
        df['Оценка экзаменатора'] = pd.to_numeric(
            df['Оценка экзаменатора'], errors='coerce'
        ).fillna(0).astype('Int64')
        
        emit('progress', {'percent': 90})
        logging.info(f"[{filename}] Обработка завершена")

        # 6. Сохранение результата
        output_path = os.path.join(temp_dir, f!processed_{filename}")
        df.to_csv(output_path, sep=';', encoding='utf-8-sig', index=False, quoting=1)

        with open(output_path, 'rb') as f:
            file_bytes = f.read()

        emit('file_ready', {
            'filename': f!обработанный_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            'data': list(file_bytes)
        })
        logging.info(f"[{filename}] Файл готов для скачивания")

        # Очистка
        os.remove(temp_path)
        os.remove(output_path)

    except Exception as e:
        logging.exception("Ошибка обработки файла")
        emit('error', {'message': str(e)})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host='0.0.0.0', port=port)

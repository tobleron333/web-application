from flask import Flask, request, send_file
from flask_cors import CORS
import pandas as pd
import requests
import json
import time
import os
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

FOLDER_ID = "b1g6grqlei218ful6p26"
MODEL = "yandexgpt-lite"

# Получение API‑ключа из окружения
API_KEY = os.environ.get("YANDEX_API_KEY")
if not API_KEY:
    raise ValueError("Переменная YANDEX_API_KEY не задана в окружении")


class APITokenManager:
    def __init__(self, api_key):
        self.api_key = api_key
        self.token = None
        self.expiry = None  # Время истечения токена

    def _get_fresh_token(self):
        """Получает новый IAM‑токен через API по API‑ключу"""
        url = "https://iam.cloud.yandex.ru/iam/v1/tokens"
        payload = {
            "api_key": self.api_key
        }
        headers = {
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=10  # Таймаут 10 секунд
            )
            if response.status_code != 200:
                raise Exception(
                    f"Ошибка API ({response.status_code}): {response.text}"
                )
            data = response.json()
            return data["iamToken"]
        except requests.exceptions.RequestException as e:
            raise Exception(f"Ошибка сети при получении токена: {e}")
        except json.JSONDecodeError as e:
            raise Exception(f"Ошибка разбора JSON: {e}")

    def _is_token_valid(self, token):
        """Проверяет токен через пробный лёгкий запрос к LLM API"""
        url = "https://llm.api.cloud.yandex.net/foundationModels/v1/models"
        headers = {
            "Authorization": f"Bearer {token}",
            "x-folder-id": FOLDER_ID,
        }
        try:
            response = requests.get(url, headers=headers, timeout=5)
            return response.status_code == 200
        except:
            return False

    def get_token(self):
        """
        Возвращает актуальный токен:
        1. Если токен есть и не истёк — проверяем его работоспособность
        2. Если токен истёк или невалиден — получаем новый
        """
        # 1. Проверка кэшированного токена
        if self.token and self.expiry and datetime.now() < self.expiry:
            if self._is_token_valid(self.token):
                return self.token
            else:
                print("Кэшированный токен не прошёл проверку. Запрашиваем новый...")

        # 2. Получение нового токена
        try:
            fresh_token = self._get_fresh_token()

            # 3. Проверка нового токена
            if self._is_token_valid(fresh_token):
                self.token = fresh_token
                # Устанавливаем TTL 1 час (3600 секунд)
                self.expiry = datetime.now() + timedelta(seconds=3600)
                print("Получен и проверен новый токен")
                return self.token
            else:
                raise Exception("Новый токен не прошёл проверку работоспособности")
        except Exception as e:
            print(f"Ошибка получения токена: {e}")

            # Аварийное использование старого токена (если есть)
            if self.token:
                print("Используем старый токен в аварийном режиме")
                return self.token
            raise


# Создаём менеджер токенов
token_manager = APITokenManager(API_KEY)


def ask_yandex_gpt(prompt):
    try:
        IAM_TOKEN = token_manager.get_token()
    except Exception as e:
        print(f"Критическая ошибка получения IAM‑токена: {e}")
        return ""

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
        response = requests.post(url, headers=headers, json=data, timeout=30)
        response.raise_for_status()
        return response.json()["result"]["alternatives"][0]["message"]["text"].strip()
    except requests.exceptions.HTTPError as e:
        print(f"HTTP ошибка: {e} | Ответ: {response.text}")
        return ""
    except Exception as e:
        print(f"Ошибка при обработке ответа: {e}")
        print(f"Ответ модели: {response.text if response else 'Нет ответа'}")
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

@app.route('/process-csv', methods=['POST'])
def process_csv():
    if 'file' not in request.files:
        return {'error': 'Файл не загружен'}, 400

    file = request.files['file']
    df = pd.read_csv(file, sep=';', dtype={'№ вопроса': 'Int64'})

    valid_mask = (
        df['№ вопроса'].notna() &
        df['Текст вопроса'].notna() &
        df['Транскрибация ответа'].notna() &
        (df['Транскрибация ответа'] != '')
    )
    df_subset = df.loc[valid_mask, ['№ вопроса', 'Текст вопроса', 'Транскрибация ответа']].copy()

    predicted_scores = []
    for i, row in df_subset.iterrows():
        prompt = generate_prompt(row)
        score = ask_yandex_gpt(prompt)
        try:
            score_value = int(score)
        except (ValueError, TypeError):
            score_value = 0
        predicted_scores.append(score_value)
        time.sleep(0.01)

    df.loc[valid_mask, 'Оценка экзаменатора'] = predicted_scores
    if 'Оценка экзаменатора' in df.columns:
        df['Оценка экзаменатора'] = pd.to_numeric(df['Оценка экзаменатора'], errors='coerce').fillna(0).astype('Int64')

    output_path = 'processed_file.csv'
    df.to_csv(output_path, sep=';', encoding='utf-8-sig', index=False, quoting=1)

    return send_file(output_path, as_attachment=True, download_name='обработанный_файл.csv')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))
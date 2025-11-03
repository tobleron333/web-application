from flask import Flask, request, send_file
from flask_cors import CORS
import pandas as pd
import requests
import time
import os
from urllib.parse import urlparse

app = Flask(__name__)
CORS(app)

FOLDER_ID = "b1g6grqlei218ful6p26"
MODEL = "yandexgpt-lite"

IAM_TOKEN_URL = os.environ.get(
    "IAM_TOKEN_URL",
    "https://iam.api.cloud.yandex.net/iam/v1/token"
)
def validate_url(url):
    try:
        result = urlparse(url)
        if all([result.scheme, result.netloc]):
            return True
        else:
            raise ValueError(f"Некорректный URL: {url}")
    except Exception as e:
        print(f"Ошибка валидации URL: {e}")
        return False

if not validate_url(IAM_TOKEN_URL):
    raise ValueError(f"Неверный URL для IAM: {IAM_TOKEN_URL}")

API_KEY = os.environ.get("YANDEX_API_KEY")
if not API_KEY:
    raise ValueError("Переменная YANDEX_API_KEY не задана в окружении")

def get_iam_token():
    headers = {"Content-Type": "application/json"}
    data = {"api_key": API_KEY}
    try:
        print(f"Запрос IAM-токена: {IAM_TOKEN_URL}")
        response = requests.post(url, json=data, headers=headers)
        response.raise_for_status()
        return response.json()["iamToken"]
    except requests.exceptions.RequestException as e:
        print(f"Ошибка получения IAM‑токена: {e}")
        raise

def ask_yandex_gpt(prompt):
    try:
        # Получаем свежий IAM‑токен перед каждым запросом
        IAM_TOKEN = get_iam_token()
    except Exception as e:
        return f"Ошибка аутентификации: {e}"

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
        response.raise_for_status()
        result = response.json()
        return result["result"]["alternatives"][0]["message"]["text"].strip()
    except requests.exceptions.HTTPError as e:
        print(f"HTTP ошибка: {e} | Ответ: {response.text}")
        return f"Ошибка API: {response.status_code}"
    except Exception as e:
        print(f"Неожиданная ошибка: {e}")
        return "Ошибка обработки ответа модели"


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
    try:
        df = pd.read_csv(file, sep=';', dtype={'№ вопроса': 'Int64'})
    except Exception as e:
        return {'error': f'Ошибка чтения CSV: {e}'}, 400


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
        time.sleep(0.01)  # Пауза для соблюдения лимитов API


    df.loc[valid_mask, 'Оценка экзаменатора'] = predicted_scores
    if 'Оценка экзаменатора' in df.columns:
        df['Оценка экзаменатора'] = pd.to_numeric(
            df['Оценка экзаменатора'], errors='coerce'
        ).fillna(0).astype('Int64')

    output_path = 'processed_file.csv'
    try:
        df.to_csv(output_path, sep=';', encoding='utf-8-sig', index=False, quoting=1)
    except Exception as e:
        return {'error': f'Ошибка сохранения CSV: {e}'}, 500


    return send_file(
        output_path,
        as_attachment=True,
        download_name='обработанный_файл.csv'
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))

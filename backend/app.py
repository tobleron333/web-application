from flask import Flask, request, send_file
from flask_cors import CORS
import pandas as pd
import requests
import json
import time
import os


app = Flask(__name__)
CORS(app)


FOLDER_ID = "b1g6grqlei218ful6p26"
MODEL = "yandexgpt-lite"


IAM_TOKEN = os.environ.get('IAM_TOKEN')
if not IAM_TOKEN:
    raise ValueError("Переменная IAM_TOKEN не задана ни в config.json, ни в окружении")

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
    response = requests.post(url, headers=headers, data=json.dumps(data))
    try:
        return response.json()["result"]["alternatives"][0]["message"]["text"].strip()
    except Exception as e:
        print("Ошибка при обработке ответа:", e)
        print("Ответ модели:", response.text)
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
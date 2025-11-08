import React, { useState } from "react";

function App() {
    const [file, setFile] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState("");
    const [uploadProgress, setUploadProgress] = useState(0); // Реальный прогресс загрузки

    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile && selectedFile.type === "text/csv") {
            setFile(selectedFile);
            setError("");
            setUploadProgress(0); // Сброс прогресса
        } else {
            setError("Выберите файл формата CSV");
            setFile(null);
        }
    };

    const handleProcess = async () => {
        if (!file) {
            setError("Сначала загрузите файл CSV");
            return;
        }

        setIsProcessing(true);
        setError("");

        const formData = new FormData();
        formData.append("file", file);

        try {
            // Создаём запрос с отслеживанием прогресса
            const response = await fetch(
                "https://web-application-xihu.onrender.com/process-csv",
                {
                    method: "POST",
                    body: formData,
                    // Отслеживаем прогресс загрузки
                    onprogress: (progressEvent) => {
                        if (progressEvent.lengthComputable) {
                            const percentCompleted = Math.round(
                                (progressEvent.loaded * 100) / progressEvent.total
                            );
                            setUploadProgress(percentCompleted);
                        }
                    }
                }
            );

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "обработанный_файл.csv";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                const errorText = await response.text();
                setError(`Ошибка сервера: ${errorText}`);
            }
        } catch (err) {
            setError(`Не удалось подключиться к серверу: ${err.message}`);
        }

        setIsProcessing(false);
        setUploadProgress(0); // Сброс прогресса после завершения
    };

    // Спиннер для обработки
    const ProcessingSpinner = () => (
        <div
            style={{
                display: "inline-block",
                width: "20px",
                height: "20px",
                border: "3px solid #fff",
                borderTopColor: "#007bff",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                marginRight: "8px",
                verticalAlign: "middle"
            }}
        />
    );

    // Полоса прогресса загрузки
    const UploadProgressBar = () => (
        <div
            style={{
                marginTop: "10px",
                width: "100%",
                backgroundColor: "#e0e0e0",
                borderRadius: "4px",
                overflow: "hidden"
            }}
        >
            <div
                style={{
                    height: "10px",
                    width: `${uploadProgress}%`,
                    backgroundColor: "#4caf50",
                    transition: "width 0.3s ease-out"
                }}
            />
        </div>
    );

    return (
        <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
            <h1>CSV File Upload & Processing</h1>

            {error && (
                <div style={{ color: "red", marginBottom: "10px" }}>
                    {error}
                </div>
            )}

            <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={isProcessing}
            />

            {/* Отображаем прогресс, если идёт загрузка */}
            {isProcessing && uploadProgress > 0 && (
                <div style={{ marginTop: "10px" }}>
                    <p>Загрузка файла: {uploadProgress}%</p>
                    <UploadProgressBar />
                </div>
            )}

            <button
                onClick={handleProcess}
                disabled={!file || isProcessing}
                style={{
                    marginTop: "10px",
                    padding: "8px 16px",
                    backgroundColor: "#007bff",
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}
            >
                {isProcessing ? (
                    <>
                        <ProcessingSpinner />
                        Обработка...
                    </>
                ) : (
                    "Обработать CSV"
                )}
            </button>

            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default App;

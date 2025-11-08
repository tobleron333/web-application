import React, { useState } from "react";


function App() {
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false); // Загрузка файла
    const [isProcessing, setIsProcessing] = useState(false); // Обработка на сервере
    const [error, setError] = useState("");
    const [uploadProgress, setUploadProgress] = useState(0); // Прогресс загрузки


    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile && selectedFile.type === "text/csv") {
            setFile(selectedFile);
            setError("");
            // Имитируем загрузку файла (в реальном проекте это будет XHR/fetch с onprogress)
            setIsUploading(true);
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                setUploadProgress(progress);
                if (progress >= 100) {
                    clearInterval(interval);
                    setIsUploading(false);
                }
            }, 100);
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
            const response = await fetch("https://web-application-xihu.onrender.com/process-csv", {
                method: "POST",
                body: formData,
            });

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
    };

    // Спиннер для обработки
    const ProcessingSpinner = () => (
        <div style={{
            display: "inline-block",
            width: "20px",
            height: "20px",
            border: "3px solid #fff",
            borderTopColor: "#007bff",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            marginRight: "8px",
            verticalAlign: "middle"
        }} />
    );

    // Полоса прогресса для загрузки файла
    const UploadProgress = () => (
        <div style={{
            marginTop: "10px",
            width: "100%",
            backgroundColor: "#e0e0e0",
            borderRadius: "4px",
            overflow: "hidden"
        }}>
            <div style={{
                height: "10px",
                width: `${uploadProgress}%`,
                backgroundColor: "#4caf50",
                transition: "width 0.3s ease-out"
            }} />
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
                disabled={isUploading || isProcessing}
            />

            {/* Отображаем прогресс загрузки, если идёт загрузка */}
            {isUploading && (
                <div style={{ marginTop: "10px" }}>
                    <p>Загрузка файла: {uploadProgress}%</p>
                    <UploadProgress />
                </div>
            )}

            <button
                onClick={handleProcess}
                disabled={!file || isUploading || isProcessing}
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

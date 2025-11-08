import React, { useState } from "react";

function App() {
    const [file, setFile] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState("");

    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile && selectedFile.type === "text/csv") {
            setFile(selectedFile);
            setError("");
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
                // Получаем текст ошибки от сервера
                const errorText = await response.text();
                setError(`Ошибка сервера: ${errorText}`);
            }
        } catch (err) {
            setError(`Не удалось подключиться к серверу: ${err.message}`);
        }

        setIsProcessing(false);
    };

    // Компонент спиннера (анимация загрузки)
    const Loader = () => (
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
                        <Loader />
                        Обработка...
                    </>
                ) : (
                    "Обработать CSV"
                )}
            </button>

            {/* CSS анимация для спиннера */}
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

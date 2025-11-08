import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";

// Подключение к вашему хостингу
const socket = io("https://web-application-f.onrender.com", {
  transports: ["websocket"],
  autoConnect: false,
});

function App() {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [resultFile, setResultFile] = useState(null);

  // Обработчик выбора файла
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

  // Обработчик отправки файла на сервер
  const handleUpload = () => {
    if (!file) {
      setError("Сначала загрузите файл CSV");
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setError("");

    // Читаем файл как ArrayBuffer
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result;

      // Подключаемся к серверу и отправляем файл
      socket.connect();
      socket.emit("upload_file", {
        file: Array.from(new Uint8Array(arrayBuffer)),
        filename: file.name,
      });
    };
    reader.readAsArrayBuffer(file);
  };

  // Обработчики событий от сервера
  useEffect(() => {
    // Обновление прогресса
    socket.on("progress", (data) => {
      setProgress(data.percent);
    });

    // Ошибка на сервере
    socket.on("error", (data) => {
      setError(data.message || "Произошла ошибка на сервере");
      setIsUploading(false);
      setProgress(0);
    });

    // Готовый файл
    socket.on("file_ready", (data) => {
      try {
        // Создаём Blob из байтов
        const blob = new Blob([new Uint8Array(data.data)], {
          type: "text/csv;charset=utf-8",
        });

        // Скачиваем файл
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        setResultFile(data.filename);
        setProgress(100);
        setIsUploading(false);
      } catch (err) {
        setError("Не удалось сохранить файл: " + err.message);
        setIsUploading(false);
      }
    });

    // Отключаемся при размонтировании
    return () => {
      socket.disconnect();
    };
  }, []);

  // Компонент спиннера
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
        verticalAlign: "middle",
      }}
    />
  );

  // Полоса прогресса
  const ProgressBar = () => (
    <div
      style={{
        marginTop: "10px",
        width: "100%",
        backgroundColor: "#e0e0e0",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "10px",
          width: `${progress}%`,
          backgroundColor: progress >= 100 ? "#4caf50" : "#2196f3",
          transition: "width 0.3s ease-out",
        }}
      />
    </div>
  );

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Обработка CSV-файла</h1>

      {error && (
        <div
          style={{
            color: "red",
            backgroundColor: "#ffecec",
            padding: "10px",
            borderRadius: "4px",
            marginBottom: "15px",
          }}
        >
          {error}
        </div>
      )}

      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        disabled={isUploading}
        style={{ marginBottom: "15px" }}
      />

      {isUploading && (
        <div style={{ marginBottom: "15px" }}>
          <p style={{ margin: "5px 0", fontSize: "14px" }}>
            Прогресс: {progress}%
          </p>
          <ProgressBar />
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || isUploading}
        style={{
          padding: "10px 20px",
          backgroundColor: isUploading ? "#6c757d" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: isUploading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {isUploading ? (
          <>
            <ProcessingSpinner />
            Идет обработка...
          </>
        ) : (
          "Загрузить и обработать"
        )}
      </button>

      {resultFile && (
        <p
          style={{
            marginTop: "20px",
            color: "#28a745",
            fontSize: "16px",
            fontWeight: "bold",
          }}
        >
          Файл "{resultFile}" успешно обработан и скачан!
        </p>
      )}

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


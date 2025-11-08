import React, { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";

function App() {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);  // Загрузка на сервер
  const [isProcessing, setIsProcessing] = useState(false); // Обработка нейросетью
  const [progress, setProgress] = useState(0);           // Прогресс обработки
  const [error, setError] = useState("");
  const socketRef = useRef(null);

  // Отключаем WebSocket при размонтировании
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

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

    // 1. Начинаем загрузку на сервер
    setIsUploading(true);
    setProgress(0);
    setError("");

    try {
      // Отправляем файл на /upload-csv
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch(
        "https://web-application-f.onrender.com/upload-csv",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        throw new Error("Ошибка загрузки файла на сервер");
      }

      // 2. Переходим к обработке через WebSocket
      setIsUploading(false);
      setIsProcessing(true);

      socketRef.current = io("https://web-application-f.onrender.com", {
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 3,
        timeout: 30000,
      });

      // Обработчики событий WebSocket
      socketRef.current.on("connect", () => {
        console.log("WebSocket подключён");
      });

      socketRef.current.on("progress", (data) => {
        setProgress(data.progress || 0);
      });

      socketRef.current.on("file_ready", (data) => {
        try {
          const blob = new Blob([data.data], { type: "text/csv;charset=utf-8" });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = data.filename || "обработанный_файл.csv";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);

          alert("Файл успешно обработан и загружен!");
        } catch (err) {
          setError(`Ошибка при сохранении файла: ${err.message}`);
        } finally {
          cleanup();
        }
      });

      socketRef.current.on("error", (err) => {
        setError(`Ошибка обработки: ${err.message || err}`);
        cleanup();
      });

      socketRef.current.on("disconnect", () => {
        console.log("WebSocket отключён");
      });

      // Запускаем обработку на сервере
      socketRef.current.emit("process_csv", {});

    } catch (err) {
      setError(`Ошибка: ${err.message}`);
      setIsUploading(false);
    }
  };

  // Очищаем состояния и соединение
  const cleanup = () => {
    setIsProcessing(false);
    setProgress(0);
    setFile(null);
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  // Анимация загрузки на сервер (вращающийся круг)
  const UploadAnimation = () => (
    <div style={{ textAlign: "center", margin: "20px 0" }}>
      <svg
        width="50"
        height="50"
        viewBox="0 0 50 50"
        style={{
          animation: "spin 1s linear infinite",
          margin: "0 auto",
        }}
      >
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="#007bff"
          strokeWidth="5"
          strokeDasharray="1,70"
          strokeLinecap="round"
        />
      </svg>
      <p style={{ marginTop: "10px", color: "#666", fontSize: "14px" }}>
        Загружается на сервер...
      </p>
    </div>
  );

  // Прогресс‑бар обработки
  const ProgressBar = () => (
    <div
      style={{
        width: "100%",
        height: "20px",
        border: "1px solid #ddd",
        borderRadius: "10px",
        overflow: "hidden",
        marginTop: "15px",
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          backgroundColor: "#4CAF50",
          transition: "width 0.3s ease",
        }}
      />
      <span
        style={{
          position: "relative",
          top: "-20px",
          left: "50%",
          transform: "translateX(-50%)",
          color: "white",
          fontSize: "12px",
          fontWeight: "bold",
        }}
      >
        {progress}%
      </span>
    </div>
  );

  return (
    <div
      style={{
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      {/* Стили анимации вращения */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>

      <h1>Обработка CSV‑файла</h1>

      {error && (
        <div
          style={{
            color: "red",
            backgroundColor: "#ffeaea",
            padding: "10px",
            borderRadius: "5px",
            marginBottom: "15px",
            border: "1px solid #ffcccc",
          }}
        >
          {error}
        </div>
      )}

      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        disabled={isUploading || isProcessing}
        style={{
          display: "block",
          marginBottom: "15px",
          padding: "8px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          width: "100%",
          boxSizing: "border-box",
        }}
      />

      <button
        onClick={handleProcess}
        disabled={!file || isUploading || isProcessing}
        style={{
          padding: "10px 20px",
          backgroundColor: isUploading || isProcessing ? "#cccccc" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: (!file || isUploading || isProcessing) ? "not-allowed" : "pointer",
          width: "100%",
          fontSize: "16px",
        }}
      >
        {isUploading
          ? "Загружается..."
          : isProcessing
          ? "Обрабатывается..."
          : "Обработать CSV"}
      </button>

      {isUploading && <UploadAnimation />}

      {isProcessing && (
        <div style={{ marginTop: "20px" }}>
          <p style={{ marginBottom: "5px", color: "#555" }}>
            Прогресс обработки:
          </p>
          <ProgressBar />
          <p
            style={{
              textAlign: "center",
              marginTop: "10px",
              color: "#777",
              fontSize: "14px",
            }}
          >
            Пожалуйста, не закрывайте страницу
          </p>
        </div>
      )}
    </div>
  );
}

export default App;


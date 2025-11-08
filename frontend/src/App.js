import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";


// Подключение к вашему серверу
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

  // Отправка файла на сервер
  const handleUpload = () => {
    if (!file) {
      setError("Сначала загрузите файл CSV");
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setError("");

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result;
      socket.connect();

      socket.emit("upload_file", {
        file: Array.from(new Uint8Array(arrayBuffer)),
        filename: file.name,
      });
    };
    reader.readAsArrayBuffer(file);
  };

  // Обработка событий от сервера
  useEffect(() => {
    // Обновление прогресса
    socket.on("progress", (data) => {
      console.log("Прогресс:", data.percent); // Отладка
      setProgress(data.percent || 0);
    });

    // Ошибка
    socket.on("error", (data) => {
      console.error("Ошибка:", data.message);
      setError(data.message || "Произошла ошибка");
      setIsUploading(false);
      setProgress(0);
    });

    // Готовый файл
    socket.on("file_ready", (data) => {
      try {
        const blob = new Blob([new Uint8Array(data.data)], {
          type: "text/csv;charset=utf-8",
        });
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

    return () => {
      socket.disconnect();
    };
  }, []);

  // Компонент полосы прогресса
  const ProgressBar = () => (
    <div
      style={{
        marginTop: "15px",
        width: "100%",
        backgroundColor: "#e0e0e0",
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <div
        style={{
          height: "20px",
          width: `${progress}%`,
          backgroundColor: progress >= 100 ? "#4caf50" : "#1976d2",
          transition: "width 0.3s ease-out",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "14px",
        }}
      >
        {progress}%
      </div>
    </div>
  );

  return (
    <div style={{ padding: "30px", fontFamily: "Arial, sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ textAlign: "center" }}>Обработка CSV-файла</h1>


      {error && (
        <div
          style={{
            backgroundColor: "#ffecec",
            color: "#d32f2f",
            padding: "15px",
            borderRadius: "8px",
            marginBottom: "20px",
            border: "1px solid #ffcdd2",
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
        style={{
          width: "100%",
          padding: "12px",
          border: "2px dashed #1976d2",
          borderRadius: "8px",
          marginBottom: "20px",
          cursor: isUploading ? "not-allowed" : "pointer",
        }}
      />

      {isUploading && (
        <div style={{ marginBottom: "20px" }}>
          <ProgressBar />
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || isUploading}
        style={{
          width: "100%",
          padding: "15px",
          backgroundColor: isUploading ? "#bdbdbd" : "#1976d2",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: isUploading ? "not-allowed" : "pointer",
          fontSize: "16px",
          fontWeight: "bold",
        }}
      >
        {isUploading ? `Идет обработка... (${progress}%)` : "Загрузить и обработать"}
      </button>

      {resultFile && (
        <p
          style={{
            marginTop: "25px",
            textAlign: "center",
            color: "#2e7d32",
            fontSize: "18px",
            fontWeight: "500",
          }}
        >
          Файл "{resultFile}" успешно обработан и скачан!
        </p>
      )}
    </div>
  );
}

export default App;


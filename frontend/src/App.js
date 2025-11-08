import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";

function App() {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Инициализация WebSocket-соединения
    const newSocket = io("https://web-application-f.onrender.com", {
      transports: ["websocket"],
      autoConnect: true,
    });

    // Обработчик полученного обработанного файла
    newSocket.on("processed_file", (data) => {
      const blob = new Blob([data.file], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setIsProcessing(false);
      setError("");
    });

    // Обработчик ошибок от сервера
    newSocket.on("error", (data) => {
      setError(`Ошибка обработки: ${data.message}`);
      setIsProcessing(false);
    });

    setSocket(newSocket);

    // Очистка соединения при размонтировании компонента
    return () => {
      newSocket.disconnect();
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

    setIsProcessing(true);
    setError("");

    try {
      // Читаем файл как ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Отправляем файл на сервер через WebSocket
      socket.emit("process_csv", {
        file: uint8Array,
        filename: file.name,
      });
    } catch (err) {
      setError(`Ошибка чтения файла: ${err.message}`);
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>CSV File Upload & Processing via WebSocket</h1>

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
        }}
      >
        {isProcessing ? "Обработка..." : "Обработать CSV"}
      </button>
    </div>
  );
}

export default App;

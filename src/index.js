import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// 找到 public/index.html 中的 root 節點
const container = document.getElementById('root');
const root = createRoot(container);

// 將 App 渲染出來
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

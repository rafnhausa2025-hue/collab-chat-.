@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  
  --color-brand-50: #eff6ff;
  --color-brand-100: #dbeafe;
  --color-brand-200: #bfdbfe;
  --color-brand-300: #93c5fd;
  --color-brand-400: #60a5fa;
  --color-brand-500: #3b82f6;
  --color-brand-600: #2563eb;
  --color-brand-700: #1d4ed8;
  --color-brand-800: #1e40af;
  --color-brand-900: #1e3a8a;
  --color-brand-950: #172554;
}

:root {
  --bg: #fdfdfd;
  --ink: #0f172a;
  --accent: #3b82f6;
  --surface: #ffffff;
  --border: #e2e8f0;
}

.dark {
  --bg: #020617;
  --ink: #f8fafc;
  --surface: #0f172a;
  --border: #1e293b;
}

body {
  background-color: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.dark .glass {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.chat-bubble {
  max-width: 85%;
  padding: 0.75rem 1.125rem;
  border-radius: 1.25rem;
  font-size: 0.9375rem;
  line-height: 1.5;
  position: relative;
  transition: all 0.2s ease;
}

.chat-bubble-me {
  background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600));
  color: white;
  border-bottom-right-radius: 0.25rem;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}

.chat-bubble-other {
  background-color: var(--surface);
  color: var(--ink);
  border-bottom-left-radius: 0.25rem;
  border: 1px solid var(--border);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

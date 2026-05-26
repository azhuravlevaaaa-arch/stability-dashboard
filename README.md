# Трекер стабильности образцов

Рабочее приложение-дашборд для Google Таблицы и загруженных Excel-источников:

Рабочий источник данных для дашборда:

https://docs.google.com/spreadsheets/d/1lccp_Iw-YHpwX3ewPHcVabhrUr1m3_S5shLq0UbufCY/edit?usp=sharing

Основная Google Sheets-ссылка для перехода из приложения:

https://docs.google.com/spreadsheets/d/1WbcOhC5qEGY4bOIZvWWQPKp9FgCiHxjWW-r6FnKYLdY/edit?gid=0#gid=0

## Как открыть

Вариант через локальный сервер:

```powershell
cd "C:\Users\azhur\Documents\New project 2\stability-dashboard"
python -m http.server 4177
```

После этого открыть:

```text
http://127.0.0.1:4177/
```

## Что показывает

- общее число образцов;
- просроченные проверки;
- проверки на сегодня;
- проверки на ближайшие 7 дней;
- карточки образцов с точками 1 день, 1 неделя, 2 недели, 4 недели, 8 недель, 12 недель;
- последние внесенные pH, вязкость и внешний вид;
- ссылку на протокол исследования.
- аудит загруженных Excel-файлов;
- образцы, которые не сопоставились автоматически;
- форму внесения нового измерения;
- экспорт локальных внесений в CSV для переноса в Google Sheets.

## Для публичной ссылки

Этот же сайт можно выложить на Vercel, Netlify или GitHub Pages. Для коллег Google Таблица должна быть доступна по ссылке хотя бы на чтение.

Для публикации нужны файлы:

- `index.html`
- `styles.css`
- `app.js`
- `source-inventory.json`
- `source-master-match.json`
- при необходимости `source-row-context.csv`

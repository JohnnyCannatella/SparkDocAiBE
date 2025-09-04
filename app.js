// app.js
'use strict';

// External dependencies
import createError from 'http-errors';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import multer from 'multer';
import { fileURLToPath } from 'url';
import cors from 'cors';

// Internal dependencies
import indexRouter from './routes/index.js';
import aiRoutes from './routes/aiRoutes.js';
import templatesRoutes from './routes/templateRoutes.js';
import contractRoutes from './routes/contractRoutes.js';
import * as dotenv from "dotenv";

// __dirname / __filename polyfill per ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

console.log(`Running in ${process.env.NODE_ENV} mode`);

if (!process.env.ANTHROPIC_KEY) {
    console.warn("Anthropic API key non impostata (manca ANTHROPIC_KEY/ANTHROPIC_API_KEY).");
}

// Initialize Express app
const app = express();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB, regola a piacere
});

// view engine setup (solo se usi Pug in alcune pagine)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rotte
app.use("/api", indexRouter(upload));

// catch 404 and forward to error handler
app.use((req, res, next) => {
    next(createError(404));
});

// error handler
app.use((err, req, res, next) => {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    const status = err.status || 500;
    res.status(status);

    if (req.accepts('json')) {
        res.json({ error: err.message, status });
    } else {
        res.render('error');
    }
});

// Avvio server
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});

export default app;
import { https } from 'firebase-functions';
import app from './app.js';  // Assicurati che il file app.js venga esportato correttamente

export const appApi = https.onRequest(app);
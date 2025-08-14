// config/env.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = process.env.NODE_ENV || 'production';
const envPath = path.join(__dirname, `../.env.${env}`);

console.log(`Attempting to load environment variables from: ${envPath}`);

try {
    const result = dotenv.config({ path: envPath });
    if (result.error) throw result.error;
} catch (error) {
    console.warn(`Failed to load .env file: ${error.message}`);
    console.warn('Continuing with process.env values');
}

export default {
    NODE_ENV: env,
    APP_PORT: process.env.APP_PORT || 8080,
    FRONTEND_URL: process.env.FRONTEND_URL || 'https://www.sparkdocai.com',
    ANTHROPIC_KEY: process.env.ANTHROPIC_KEY
};
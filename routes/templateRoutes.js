// routes/templateRoutes.js
import express from "express";
import { parseTemplate } from "../controllers/templateController.js";

export default function templateRoutes(upload) {
    const router = express.Router();

    // Lascio che siano i controller a rispondere con res.json
    router.post("/parse-template", upload.single("file"), parseTemplate);

    return router;
}
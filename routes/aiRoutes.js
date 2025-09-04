// routes/aiRoutes.js
import express from "express";
import { processSingleDocument } from "../controllers/aiController.js";

export default function aiRoutes(upload) {
    const router = express.Router();

    // Lascio che siano i controller a rispondere con res.json
    router.post("/process-single", upload.single('document'), processSingleDocument);

    return router;
}
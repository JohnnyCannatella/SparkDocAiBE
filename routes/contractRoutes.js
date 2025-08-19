// routes/contractRoutes.js
import express from "express";
import { generateContracts } from "../controllers/contractController.js";

export default function contractsRoutes(upload) {
    const router = express.Router();

    // Lascio che siano i controller a rispondere con res.json
    router.post("/generate-contracts", upload.single("file"), generateContracts);

    return router;
}
import express from 'express';
import aiRoutes from './aiRoutes.js';
import contractRoutes from "./contractRoutes.js";
import templateRoutes from "./templateRoutes.js";

export default function(upload) { // Accetta 'upload' come argomento
    const router = express.Router();

    /* GET home page. */
    router.get('/', function(req, res, next) {
        res.render('index', { title: 'Express' });
    });

    // Passa l'istanza 'upload' al router delle AI
    router.use('/ai', aiRoutes(upload));
    router.use('/match', contractRoutes(upload));
    router.use('/templates', templateRoutes(upload));

    return router;
}

import express from 'express';
const router = express.Router();

// definisci qui le tue rotte, ad es:
router.get('/', (req, res) => {
    res.send('API index');
});

export default router;
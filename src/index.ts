import express from 'express';
import dotenv from 'dotenv';
import tradeRouter from '../routers/tradeRouter'
import cors from 'cors';

dotenv.config();

const port = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(cors());



app.use('/trade', tradeRouter)
 
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
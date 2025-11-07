import { NextFunction, Request, Response } from "express";

export function checkPassword() {
    const correctPassword = process.env.API_PASSWORD; 
    return (req: Request, res:Response, next: NextFunction) => {
        const password = req.headers['x-password']; 


        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        if (password !== correctPassword) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        
        next();
    };
}
import "express";

declare global {
  namespace Express {
    interface CurrentUser {
      id: number;
      email: string;
      name: string;
      role: string;
    }
    interface Request {
      currentUser?: CurrentUser;
      currentUserId?: number;
    }
  }
}

export {};

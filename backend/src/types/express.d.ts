declare global {
  namespace Express {
    interface Request {
      auth?: {
        id: number;
        userId: number;
        username: string;
        roles: string[];
        store_id: number | null;
      };
    }
  }
}

export {};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        id: string;
        userId: string;
        username: string;
        roles: string[];
        store_id: string | null;
      };
      storeScope?: {
        storeId: string;
        storeCode: string;
      };
      storeFilter?: Record<string, unknown>;
    }
  }
}

export {};

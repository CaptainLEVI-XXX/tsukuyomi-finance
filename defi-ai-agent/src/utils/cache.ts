import NodeCache from 'node-cache';

export class CacheManager {
    private static instance: CacheManager;
    private cache: NodeCache;
    
    private constructor() {
        this.cache = new NodeCache({
            stdTTL: 300, // 5 minutes default
            checkperiod: 60, // Check for expired keys every 60 seconds
            useClones: false // For better performance
        });
    }
    
    static getInstance(): CacheManager {
        if (!CacheManager.instance) {
            CacheManager.instance = new CacheManager();
        }
        return CacheManager.instance;
    }
    
    get<T>(key: string): T | undefined {
        return this.cache.get<T>(key);
    }
    
    set<T>(key: string, value: T, ttl?: number): boolean {
        return this.cache.set(key, value, ttl || 300);
    }
    
    del(key: string): number {
        return this.cache.del(key);
    }
    
    flush(): void {
        this.cache.flushAll();
    }
    
    getStats() {
        return this.cache.getStats();
    }
}
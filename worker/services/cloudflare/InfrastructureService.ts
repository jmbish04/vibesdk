import { createLogger } from '../../logger';

const logger = createLogger('InfrastructureService');

export class InfrastructureService {
    private accountId: string;
    private apiToken: string;
    private baseUrl = 'https://api.cloudflare.com/client/v4';

    constructor(accountId: string, apiToken: string) {
        this.accountId = accountId;
        this.apiToken = apiToken;
    }

    private getHeaders() {
        return {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Create a KV Namespace
     */
    async createKVNamespace(title: string): Promise<{ id: string; title: string } | null> {
        logger.info(`Creating KV Namespace: ${title}`);
        const url = `${this.baseUrl}/accounts/${this.accountId}/storage/kv/namespaces`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ title })
            });

            interface CloudflareResponse<T> {
                success: boolean;
                result: T;
                errors: { code: number; message: string }[];
            }
            interface KVNamespace {
                id: string;
                title: string;
            }
            const data = await response.json() as CloudflareResponse<KVNamespace>;

            if (data.success) {
                return data.result;
            } else {
                // If it already exists, we might want to find it.
                // For now, log error.
                 logger.error(`Failed to create KV Namespace: ${JSON.stringify(data.errors)}`);
                 return null;
            }
        } catch (error) {
            logger.error(`Error creating KV Namespace`, error);
            return null;
        }
    }

    /**
     * Create a D1 Database
     */
    async createD1Database(name: string): Promise<{ uuid: string; name: string } | null> {
        logger.info(`Creating D1 Database: ${name}`);
        const url = `${this.baseUrl}/accounts/${this.accountId}/d1/database`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ name })
            });

            const data = await response.json() as any;

            if (data.success) {
                return data.result;
            } else {
                logger.error(`Failed to create D1 Database: ${JSON.stringify(data.errors)}`);
                return null;
            }
        } catch (error) {
            logger.error(`Error creating D1 Database`, error);
            return null;
        }
    }

    /**
     * Create an R2 Bucket
     */
    async createR2Bucket(name: string): Promise<{ name: string } | null> {
        logger.info(`Creating R2 Bucket: ${name}`);
        // R2 bucket names must be lowercase
        const bucketName = name.toLowerCase();
        const url = `${this.baseUrl}/accounts/${this.accountId}/r2/buckets`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ name: bucketName })
            });

            const data = await response.json() as any;

            if (data.success) {
                return data.result;
            } else {
                 // Check if it already exists (Cloudflare might return error or success depending on API)
                 // R2 creation usually fails if exists.
                 logger.error(`Failed to create R2 Bucket: ${JSON.stringify(data.errors)}`);
                 return null;
            }
        } catch (error) {
             logger.error(`Error creating R2 Bucket`, error);
             return null;
        }
    }

    /**
     * Provisions resources defined in Wrangler config (or implied)
     * For simplicity, this method accepts a list of required resources and creates them.
     */
    async provisionResources(resources: {
        kv?: string[],
        d1?: string[],
        r2?: string[]
    }): Promise<{
        kv: Record<string, string>, // name -> id
        d1: Record<string, string>, // name -> id
        r2: string[]
    }> {
        const results = {
            kv: {} as Record<string, string>,
            d1: {} as Record<string, string>,
            r2: [] as string[]
        };

        if (resources.kv) {
            for (const name of resources.kv) {
                const result = await this.createKVNamespace(name);
                if (result) {
                    results.kv[name] = result.id;
                }
            }
        }

        if (resources.d1) {
            for (const name of resources.d1) {
                const result = await this.createD1Database(name);
                if (result) {
                    results.d1[name] = result.uuid;
                }
            }
        }

        if (resources.r2) {
            for (const name of resources.r2) {
                const result = await this.createR2Bucket(name);
                if (result) {
                    results.r2.push(result.name);
                }
            }
        }

        return results;
    }
}

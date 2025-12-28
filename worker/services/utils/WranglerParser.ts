import { parse, modify, applyEdits, Node } from 'jsonc-parser';
import { createLogger } from '../../logger';

const logger = createLogger('WranglerParser');

export interface ResourceRequirement {
    type: 'kv_namespaces' | 'd1_databases' | 'r2_buckets';
    binding: string;
    id?: string;
    name?: string; // D1 or R2 name
}

export class WranglerParser {

    /**
     * Parses wrangler.jsonc content and returns list of resources that might need provisioning.
     * It checks for KV, D1, R2.
     */
    static parseRequirements(content: string): ResourceRequirement[] {
        const requirements: ResourceRequirement[] = [];
        const errors: any[] = [];
        const root = parse(content, errors);

        if (errors.length > 0) {
            logger.warn('Error parsing wrangler.jsonc', errors);
            return [];
        }

        // KV
        if (root.kv_namespaces && Array.isArray(root.kv_namespaces)) {
            for (const kv of root.kv_namespaces) {
                if (kv.binding) {
                    requirements.push({
                        type: 'kv_namespaces',
                        binding: kv.binding,
                        id: kv.id
                    });
                }
            }
        }

        // D1
        if (root.d1_databases && Array.isArray(root.d1_databases)) {
            for (const d1 of root.d1_databases) {
                if (d1.binding) {
                    requirements.push({
                        type: 'd1_databases',
                        binding: d1.binding,
                        id: d1.database_id,
                        name: d1.database_name
                    });
                }
            }
        }

        // R2
        if (root.r2_buckets && Array.isArray(root.r2_buckets)) {
            for (const r2 of root.r2_buckets) {
                if (r2.binding) {
                    requirements.push({
                        type: 'r2_buckets',
                        binding: r2.binding,
                        name: r2.bucket_name
                    });
                }
            }
        }

        return requirements;
    }

    /**
     * Updates the wrangler configuration with new resource IDs.
     */
    static updateConfig(content: string, updates: Array<{ type: string, binding: string, key: string, value: string }>): string {
        let updatedContent = content;

        for (const update of updates) {
            const errors: any[] = [];
            const root = parse(updatedContent, errors);
            if (!root) continue;

            // Find the array
            const arr = root[update.type];
            if (Array.isArray(arr)) {
                // Find the index of the item with the matching binding
                const index = arr.findIndex((item: any) => item.binding === update.binding);
                if (index !== -1) {
                    // Modify
                    const edits = modify(updatedContent, [update.type, index, update.key], update.value, {});
                    updatedContent = applyEdits(updatedContent, edits);
                }
            }
        }
        return updatedContent;
    }
}

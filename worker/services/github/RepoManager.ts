import { GitHubService } from './GitHubService';
import { MemFS } from '../../agents/git/memfs';
import git from '@ashishkumar472/cf-git';
import { createLogger } from '../../logger';

const logger = createLogger('RepoManager');

export interface PushOptions {
    repoName: string;
    token: string;
    files: Array<{ path: string; content: string }>;
    commitMessage: string;
    branch?: string;
    username: string;
    email: string;
    description?: string;
    private?: boolean;
}

export class RepoManager {
    /**
     * Pushes files to a GitHub repository.
     * Creates the repository if it doesn't exist.
     */
    static async pushToGitHub(options: PushOptions): Promise<{ success: boolean; url?: string; error?: string }> {
        const { repoName, token, files, commitMessage, username, email } = options;
        const branch = options.branch || 'main';

        logger.info('Starting pushToGitHub', { repoName, fileCount: files.length });

        try {
            // 1. Check/Create Repository
            let repoUrl = `https://github.com/${username}/${repoName}`;
            const exists = await GitHubService.repositoryExists({ repositoryUrl: repoUrl, token });

            if (!exists) {
                logger.info('Repository does not exist, creating...');
                const createResult = await GitHubService.createUserRepository({
                    name: repoName,
                    token,
                    private: options.private ?? true,
                    description: options.description || 'Created via VibeSDK',
                    auto_init: true // Initialize to have a base
                });

                if (!createResult.success || !createResult.repository) {
                    throw new Error(createResult.error || 'Failed to create repository');
                }
                repoUrl = createResult.repository.html_url;
                logger.info('Repository created', { repoUrl });
            }

            // 2. Prepare MemFS
            const fs = new MemFS();
            await git.init({ fs, dir: '/', defaultBranch: branch });

            // 3. Write files
            for (const file of files) {
                // Ensure directory exists
                const dir = file.path.substring(0, file.path.lastIndexOf('/'));
                if (dir) {
                    await fs.mkdir(dir, { recursive: true });
                }
                await fs.writeFile(file.path, file.content);
                await git.add({ fs, dir: '/', filepath: file.path });
            }

            // 4. Commit
            await git.commit({
                fs,
                dir: '/',
                message: commitMessage,
                author: {
                    name: username,
                    email: email,
                    timestamp: Math.floor(Date.now() / 1000)
                }
            });

            // 5. Push
            logger.info('Pushing to GitHub...');
            const result = await GitHubService.pushViaGitProtocol(fs, token, repoUrl);

            if (result.success) {
                return { success: true, url: repoUrl };
            } else {
                return { success: false, error: result.error };
            }

        } catch (error) {
            logger.error('pushToGitHub failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

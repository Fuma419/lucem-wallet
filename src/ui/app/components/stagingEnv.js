/** True for Vercel Preview builds (the `staging` git branch). */
export const isVercelPreviewDeploy = (vercelEnv = process.env.VERCEL_ENV) =>
  vercelEnv === 'preview';

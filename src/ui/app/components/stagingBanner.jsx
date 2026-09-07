import React from 'react';
import { isVercelPreviewDeploy } from './stagingEnv';

export { isVercelPreviewDeploy };

/**
 * Non-blocking marker so a staging URL is not mistaken for production.
 * Hidden on local `npm start` and Production deploys.
 */
const StagingBanner = () => {
  if (!isVercelPreviewDeploy()) return null;
  return (
    <div
      className="lucem-staging-banner"
      role="status"
      aria-label="Staging deployment"
      data-testid="lucem-staging-banner"
    >
      Staging
    </div>
  );
};

export default StagingBanner;

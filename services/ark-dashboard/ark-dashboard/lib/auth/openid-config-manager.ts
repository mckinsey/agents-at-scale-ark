import { OIDC_CONFIG_URL } from '@/lib/constants/auth';

type OIDCWellKnownConfig = {
  token_endpoint?: string;
  end_session_endpoint?: string;
};

class OpenidConfigManager {
  private fetchPromise: Promise<OIDCWellKnownConfig> | null;
  private config: OIDCWellKnownConfig | null;

  constructor() {
    this.config = null;
    this.fetchPromise = null;
  }

  async getConfig() {
    if (this.config) {
      return this.config;
    }

    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this._fetchConfig();

    try {
      return this.fetchPromise;
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async _fetchConfig() {
    const response = await fetch(OIDC_CONFIG_URL);

    if (!response.ok) {
      console.error(
        `Failed to fetch OIDC well-known config: ${response.status} ${response.statusText}`,
      );
      throw new Error(
        `Failed to fetch OIDC well-known config: ${response.status} ${response.statusText}`,
      );
    }

    const config: OIDCWellKnownConfig = await response.json();
    this.config = config;

    return config;
  }
}

export const openidConfigManager = new OpenidConfigManager();

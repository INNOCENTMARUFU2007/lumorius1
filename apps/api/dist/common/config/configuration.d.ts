declare const _default: () => {
    port: number;
    nodeEnv: string;
    appUrl: string;
    database: {
        url: string;
        poolMin: number;
        poolMax: number;
    };
    redis: {
        url: string;
        password: string;
    };
    jwt: {
        secret: string;
        refreshSecret: string;
        expiresIn: string;
        refreshExpiresIn: string;
    };
    session: {
        secret: string;
    };
    oauth: {
        google: {
            clientId: string;
            clientSecret: string;
        };
        github: {
            clientId: string;
            clientSecret: string;
        };
        microsoft: {
            clientId: string;
            clientSecret: string;
        };
    };
    email: {
        host: string;
        port: number;
        user: string;
        pass: string;
        from: string;
    };
    s3: {
        endpoint: string;
        bucket: string;
        region: string;
        accessKey: string;
        secretKey: string;
    };
    ai: {
        openai: {
            apiKey: string;
        };
        anthropic: {
            apiKey: string;
        };
        gemini: {
            apiKey: string;
        };
        defaultProvider: string;
        embeddingModel: string;
    };
    opensearch: {
        url: string;
        user: string;
        password: string;
    };
    stripe: {
        secretKey: string;
        webhookSecret: string;
        publishableKey: string;
    };
    sentry: {
        dsn: string;
    };
};
export default _default;
//# sourceMappingURL=configuration.d.ts.map
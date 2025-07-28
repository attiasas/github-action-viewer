
export interface User {
    id: number; // Unique identifier for the user (name)
    createdAt: string; // ISO date string
    updatedAt: string; // ISO date string
    runRetention: number; // Number of days to retain workflow runs
}

export interface ServerDetails {
    id: number;
    serverName: string;
    serverUrl: string;
    apiToken: string; // Token for API access
    userId: number; // ID of the user who owns this server
    createdAt: string; // ISO date string
    updatedAt: string; // ISO date string
    isDefault: boolean; // Whether this is the default server for the user
}

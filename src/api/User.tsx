
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

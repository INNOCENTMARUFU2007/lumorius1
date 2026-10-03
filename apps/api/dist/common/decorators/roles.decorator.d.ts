export type UserRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';
export declare const ROLES_KEY = "roles";
export declare const Roles: (...roles: UserRole[]) => import("@nestjs/common").CustomDecorator<string>;
//# sourceMappingURL=roles.decorator.d.ts.map
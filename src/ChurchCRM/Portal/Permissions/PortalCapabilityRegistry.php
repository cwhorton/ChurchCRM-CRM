<?php

namespace ChurchCRM\Portal\Permissions;

/**
 * Every portal capability and rule this installation knows (member sign-in
 * design §8.1). Capabilities live in code, not in a table: core registers its
 * catalog on first use.
 */
final class PortalCapabilityRegistry
{
    /** @var array<string, PortalCapability> */
    private static array $capabilities = [];

    /** @var array<string, array{rule: PortalRule, owner: string}> */
    private static array $rules = [];

    private static bool $booted = false;

    public static function register(PortalCapability $capability): void
    {
        self::$capabilities[$capability->key] = $capability;
    }

    public static function registerRule(PortalRule $rule, string $owner = PortalCapability::OWNER_CORE): void
    {
        self::$rules[$rule->getKey()] = ['rule' => $rule, 'owner' => $owner];
    }

    public static function get(string $key): ?PortalCapability
    {
        self::boot();

        return self::$capabilities[$key] ?? null;
    }

    /**
     * @return array<string, PortalCapability> in registration order, core first
     */
    public static function all(): array
    {
        self::boot();

        return self::$capabilities;
    }

    /**
     * The rules whose owner is on.
     *
     * @return array<string, PortalRule>
     */
    public static function activeRules(): array
    {
        self::boot();

        $rules = [];
        foreach (self::$rules as $key => $entry) {
            if (self::isOwnerActive($entry['owner'])) {
                $rules[$key] = $entry['rule'];
            }
        }

        return $rules;
    }

    public static function isOwnerActive(string $owner): bool
    {
        return $owner === PortalCapability::OWNER_CORE;
    }

    /** @internal tests, and code that changes what is registered within one request */
    public static function reset(): void
    {
        self::$capabilities = [];
        self::$rules = [];
        self::$booted = false;
    }

    private static function boot(): void
    {
        if (self::$booted) {
            return;
        }
        self::$booted = true;

        CorePortalCapabilities::register();
    }
}

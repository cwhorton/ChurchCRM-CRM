<?php

namespace ChurchCRM\Slim\Middleware\Api;

use ChurchCRM\Utils\LoggerUtils;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Families have no email of their own since 7.9.0 (member sign-in design §10).
 * For that one release, the endpoints that returned a family's email still
 * return one, read-only: the head of household's, else the spouse's. This
 * marks their responses deprecated (RFC 9745) and logs a client that still
 * sends a family email, which is not stored.
 */
class FamilyEmailDeprecationMiddleware implements MiddlewareInterface
{
    /** 2026-10-17T00:00:00Z, when the family email was deprecated. */
    public const DEPRECATED_AT = 1792195200;

    private const DOCS_URL = 'https://docs.churchcrm.io/api/';

    /**
     * @param string      $docsPage     the endpoint's page under DOCS_URL, named from its operationId
     * @param string|null $writtenField the request field that used to set the family email
     */
    public function __construct(
        private readonly string $docsPage,
        private readonly ?string $writtenField = null
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $body = $request->getParsedBody();
        if ($this->writtenField !== null && is_array($body) && array_key_exists($this->writtenField, $body)) {
            LoggerUtils::getAppLogger()->warning(sprintf(
                'Ignored the family email sent to %s %s: families have no email since 7.9.0. Set a person\'s email instead.',
                $request->getMethod(),
                $request->getUri()->getPath()
            ));
        }

        return $handler->handle($request)
            ->withHeader('Deprecation', '@' . self::DEPRECATED_AT)
            ->withAddedHeader('Link', '<' . self::DOCS_URL . $this->docsPage . '>; rel="deprecation"; type="text/html"');
    }
}

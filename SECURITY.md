# Security Policy

## Reporting Security Issues

We take security seriously. Please **DO NOT** open public issues for security vulnerabilities.

Instead, please use the **Report a vulnerability** button located in the **Security** tab of this repository (under 'Advisories'). This allows us to discuss and fix the issue privately before disclosing it to the public.

### Private Disclosure Process

1. Navigate to the [Security tab](https://github.com/geckozr/nog-cli/security) of the repository.
2. Click **"Advisories"** → **"Report a vulnerability"**.
3. Provide detailed information about the vulnerability:
   - Description of the vulnerability
   - Steps to reproduce (if applicable)
   - Potential impact
   - Suggested fix (if you have one)

### Response Timeline

We aim to acknowledge security reports within 48 hours and provide a timeline for a fix within 7 days.

### Security Best Practices for Users

- **Keep nog-cli updated** to the latest version.
- **Review generated code** before deploying to production.
- **Validate OpenAPI specifications** from untrusted sources.
- **Use strong authentication** for APIs generated with nog-cli.

## Supported Versions

Security patches are provided for:

- Current stable release (e.g., 0.9.x)
- Previous stable release (e.g., 0.8.x)

Older versions may not receive security updates. Please upgrade to the latest version.

## Security Considerations

### Code Generation

The generated code is based on the OpenAPI specification provided. Ensure that:

- OpenAPI specs come from trusted sources.
- Validation decorators are appropriate for your use case.
- Error handling is properly configured in your NestJS application.

### Dependencies

nog-cli uses only essential production dependencies. All dependencies are regularly audited for vulnerabilities.

Run `npm audit` in your project to check for known vulnerabilities in your installed packages.

## Contact

For security inquiries or clarifications, please refer to the private vulnerability reporting process above.

Thank you for helping keep nog-cli secure.

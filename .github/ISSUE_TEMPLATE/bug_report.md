name: Bug Report

description: Report something that is not working as expected

labels: ["bug"]

body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to report a bug. Please fill out the form below to help us understand and resolve the issue quickly.

  - type: textarea
    id: description
    attributes:
      label: Bug Description
      description: A clear and concise description of what the bug is.
      placeholder: Describe the issue in detail...
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: |
        How do you trigger this bug? Please be as specific as possible.
        Example:
          1. Go to '...'
          2. Click on '...'
          3. See error
      placeholder: |
        1.
        2.
        3.
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What should happen instead?
      placeholder: It should ...
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual Behavior
      description: What actually happens?
      placeholder: It actually ...
    validations:
      required: true

  - type: dropdown
    id: version
    attributes:
      label: Version
      description: Which version of FlashRoute are you using?
      options:
        - Latest (main)
        - Latest stable release
        - Development build
    validations:
      required: true

  - type: dropdown
    id: deployment
    attributes:
      label: Deployment
      description: How are you running FlashRoute?
      options:
        - Local development
        - Docker Compose (local)
        - Docker Compose (production)
        - VPS/Cloud server
        - Other
    validations:
      required: true

  - type: textarea
    id: logs
    attributes:
      label: Relevant Logs
      description: |
        Paste any relevant log output. **Remove any sensitive values** (API keys, passwords, etc.) first.
      placeholder: |
        [timestamp] level=error msg="..." ...
    validations:
      required: false

  - type: textarea
    id: context
    attributes:
      label: Additional Context
      description: Any other context about the problem? (browser, OS, network, etc.)
      placeholder: Add any other context here...
    validations:
      required: false

  - type: checkboxes
    id: checkbox
    attributes:
      label: Pre-check
      options:
        - label: I have searched existing issues and confirmed this is not a duplicate
          required: true
        - label: I have removed any sensitive values (API keys, passwords, etc.) from the logs
          required: true

name: Feature Request

description: Suggest a new feature or improvement

labels: ["enhancement", "triage"]

body:
  - type: markdown
    attributes:
      value: |
        Thanks for your interest in improving FlashRoute! Please fill out the form below to describe your feature or improvement.

  - type: textarea
    id: problem
    attributes:
      label: Problem Statement
      description: |
        What problem does this feature solve? Who needs it and why?
        Be specific about the use case and pain point.
      placeholder: |
        I want to be able to ...
        So that I can ...
        Currently, I have to ...
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Proposed Solution
      description: |
        Describe your proposed solution. How should it work?
        Include any technical details, API changes, or UX considerations if applicable.
      placeholder: |
        The feature should:
        1. ...
        2. ...
        3. ...
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives Considered
      description: |
        What alternatives have you considered? Why did you prefer this approach?
      placeholder: |
        I considered:
        - Option A: ...
        - Option B: ...
        But I prefer this because ...
    validations:
      required: false

  - type: dropdown
    id: phase
    attributes:
      label: Phase
      description: Which build phase does this belong to?
      options:
        - Phase F (Execution Engine) — not yet started
        - Phase G+ (Monitoring enhancements)
        - Infrastructure / DevOps
        - Documentation
        - Other
    validations:
      required: false

  - type: checkboxes
    id: checkbox
    attributes:
      label: Pre-check
      options:
        - label: I have searched existing issues and confirmed this is not a duplicate
          required: true
        - label: I understand this is for the monitoring product; execution engine requests will be tracked separately
          required: true

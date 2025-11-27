# Phone Number Validation Specification

## Overview
The phone validation system supports both standard numeric phone numbers and vanity numbers (with letters). All phone inputs are processed through a vanity-to-numeric converter before validation.

## Valid Input Examples

### Standard Numeric Formats
- `1234567890` - Basic 10-digit number
- `123-456-7890` - Dashes
- `(123) 456-7890` - Parentheses and spaces
- `123.456.7890` - Dots
- `+1 123 456 7890` - International format with plus
- `1234567` - Minimum 7 digits
- `1234567890123456` - Maximum 16 digits

### Vanity Numbers
- `1-877-ROD-SHOWS` - Mixed digits and letters with separators
- `1877RODSHOWS` - Mixed without separators
- `1-800-FLOWERS` - Classic vanity format
- `(800) CALL-NOW` - Vanity with parentheses
- `1-800-GOT-JUNK` - Multi-word vanity

## Invalid Input Examples & Reasons

### Too Short (< 7 digits after cleanup)
- `12` - Only 2 digits
- `12345` - Only 5 digits
- `123456` - Only 6 digits
- **Why:** Phone numbers must be at least 7 digits (local number minimum)

### Too Long (> 16 digits after cleanup)
- `12345678901234567` - 17 digits
- **Why:** International phone numbers max out at 16 digits

### Invalid Starting Digit
- `0123456789` - Starts with 0
- **Why:** Valid phone numbers start with digits 1-9 (no leading zeros)

### Unstructured Text
- `call me maybe` - Only letters and spaces, no phone structure
- **Why:** Must contain at least one digit OR one phone separator (dash, parentheses, dot, plus)
- Spaces alone don't constitute phone structure

### Invalid Characters
- `123-456-7890#` - Hash symbol
- `123*456*7890` - Asterisks
- `123@456@7890` - At symbols
- `123!456!7890` - Exclamation marks
- **Why:** Only digits, letters (A-Z), and standard phone separators are allowed

### Security/Injection Attempts
- `DROP TABLE users;` - SQL injection
- `<script>alert(1)</script>` - XSS injection
- `${process.exit()}` - Code injection
- `../../etc/passwd` - Path traversal
- **Why:** These contain invalid characters and don't match phone structure

### Empty/Whitespace Only
- `` - Empty string
- `   ` - Only spaces
- **Why:** No content to validate

## Validation Pipeline

1. **Structure Check:** Input must contain at least one digit or phone separator (-, (, ), ., +)
   - Spaces alone don't count as structure
   - Prevents unstructured text like "call me maybe" from passing

2. **Vanity Conversion:** All letters converted to phone keypad digits
   - A-C → 2, D-F → 3, G-I → 4, J-L → 5, M-O → 6, P-S → 7, T-V → 8, W-Z → 9
   - Digits pass through unchanged
   - Separators (spaces, dashes, parens, dots, plus) preserved

3. **Cleanup:** Remove all separators (spaces, dashes, parens, dots)
   - Plus sign may remain for international format

4. **Final Validation:** Regex pattern check
   - Optional leading `+`
   - Must start with digit 1-9
   - Followed by 6-15 more digits (total: 7-16 digits)
   - Only digits allowed after cleanup

## Implementation Notes

- **Fast-track for numeric:** Numeric characters pass through converter unchanged (O(1) for digits)
- **Case-insensitive:** Letters converted to uppercase before keypad mapping
- **Separator-agnostic:** Standard separators allowed in any combination
- **Security-focused:** Invalid characters rejected; no special character injection possible
- **International support:** Supports + prefix and up to 16 digits for international numbers

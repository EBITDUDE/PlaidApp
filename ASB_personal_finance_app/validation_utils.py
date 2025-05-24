import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

class ValidationError(Exception):
    """Custom exception for validation errors"""
    pass

class InputValidator:
    """Centralized input validation for the application"""
    
    @staticmethod
    def validate_transaction(data, is_update=False):
        """Validate transaction data"""
        errors = []
        
        # Required fields for new transactions
        if not is_update:
            required_fields = ['date', 'amount', 'category', 'merchant']
            for field in required_fields:
                if field not in data or not str(data.get(field, '')).strip():
                    errors.append(f"{field} is required")
        
        # Validate date
        if 'date' in data:
            try:
                date_str = data['date']
                # Support multiple date formats
                for fmt in ['%m/%d/%Y', '%Y-%m-%d', '%d/%m/%Y']:
                    try:
                        datetime.strptime(date_str, fmt)
                        break
                    except ValueError:
                        continue
                else:
                    errors.append("Invalid date format. Use MM/DD/YYYY")
            except Exception:
                errors.append("Invalid date")
        
        # Validate amount
        if 'amount' in data:
            try:
                amount = Decimal(str(data['amount']).replace('$', '').replace(',', ''))
                if amount <= 0:
                    errors.append("Amount must be greater than zero")
                if amount > Decimal('999999.99'):
                    errors.append("Amount exceeds maximum allowed value")
            except (InvalidOperation, ValueError):
                errors.append("Invalid amount format")
        
        # Validate category and merchant (length and content)
        for field in ['category', 'merchant', 'subcategory']:
            if field in data:
                value = str(data.get(field, '')).strip()
                if len(value) > 100:
                    errors.append(f"{field} must be 100 characters or less")
                if value and not InputValidator.is_safe_string(value):
                    errors.append(f"{field} contains invalid characters")
        
        # Validate account_id if provided
        if 'account_id' in data and data['account_id']:
            if not InputValidator.is_valid_id(data['account_id']):
                errors.append("Invalid account ID")
        
        if errors:
            raise ValidationError("; ".join(errors))
        
        return True
    
    @staticmethod
    def validate_category(data):
        """Validate category data"""
        errors = []
        
        if 'category' not in data or not data['category'].strip():
            errors.append("Category name is required")
        
        category = data.get('category', '').strip()
        if len(category) > 50:
            errors.append("Category name must be 50 characters or less")
        
        if not InputValidator.is_safe_string(category):
            errors.append("Category name contains invalid characters")
        
        if errors:
            raise ValidationError("; ".join(errors))
        
        return True
    
    @staticmethod
    def validate_rule(data):
        """Validate rule data"""
        errors = []
        
        # Validate description if matching is enabled
        if data.get('match_description', True):
            description = data.get('description', '').strip()
            if not description:
                errors.append("Description is required when description matching is enabled")
            if len(description) > 200:
                errors.append("Description must be 200 characters or less")
        
        # Validate amount if matching is enabled
        if data.get('match_amount', False):
            try:
                amount = Decimal(str(data.get('amount', 0)))
                if amount < 0:
                    errors.append("Amount cannot be negative")
            except (InvalidOperation, ValueError):
                errors.append("Invalid amount format")
        
        # Validate category
        if 'category' not in data or not data['category'].strip():
            errors.append("Target category is required")
        
        if errors:
            raise ValidationError("; ".join(errors))
        
        return True
    
    @staticmethod
    def is_safe_string(value):
        """Check if string contains only safe characters"""
        # Allow alphanumeric, spaces, and common punctuation
        pattern = r'^[a-zA-Z0-9\s\-_.,&\'\"()/]+$'
        return bool(re.match(pattern, value))
    
    @staticmethod
    def is_valid_id(value):
        """Check if value is a valid ID format"""
        # Allow alphanumeric and hyphens (for UUIDs and Plaid IDs)
        pattern = r'^[a-zA-Z0-9\-]+$'
        return bool(re.match(pattern, str(value)))
    
    @staticmethod
    def sanitize_for_display(value):
        """Sanitize string for safe HTML display"""
        if not value:
            return ""
        
        # Convert to string and escape HTML entities
        value = str(value)
        replacements = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        }
        
        for char, escape in replacements.items():
            value = value.replace(char, escape)
        
        return value
import json
import logging
import traceback
from functools import wraps
from flask import jsonify
import plaid

# Set up logging
logger = logging.getLogger(__name__)

# Define error classes
class AppError(Exception):
    """Base exception for application errors"""
    status_code = 500
    
    def __init__(self, message, status_code=None, details=None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.details = details or {}
    
    def to_dict(self):
        return {
            'error': self.message,
            'details': self.details
        }

class AuthenticationError(AppError):
    """Exception for authentication failures"""
    status_code = 401

class ValidationError(AppError):
    """Exception for validation failures"""
    status_code = 400

class ResourceNotFoundError(AppError):
    """Exception for missing resources"""
    status_code = 404

class PlaidApiError(AppError):
    """Exception for Plaid API errors"""
    status_code = 502  # Bad Gateway

def api_error_handler(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except AppError as e:
            logger.error(f"Application error in {f.__name__}: {str(e)}")
            return jsonify(e.to_dict()), e.status_code
        except plaid.ApiException as e:
            logger.error(f"Plaid API error in {f.__name__}: {str(e)}")
            error_response = json.loads(e.body) if hasattr(e, 'body') else {'error_message': str(e)}
            details = {'plaid_error': error_response.get('error_message', 'Unknown Plaid error')}
            return jsonify(PlaidApiError('Error communicating with Plaid', details=details).to_dict()), 502
        except ValueError as e:
            logger.error(f"Validation error in {f.__name__}: {str(e)}")
            return jsonify(ValidationError(str(e)).to_dict()), 400
        except Exception as e:
            logger.error(f"Unexpected error in {f.__name__}: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({
                'error': 'An unexpected error occurred',
                'details': {'message': str(e)}
            }), 500
    return decorated_function
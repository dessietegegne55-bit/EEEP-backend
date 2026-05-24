// backend/src/utils/constants.js

// User Roles
const USER_ROLES = {
    STUDENT: 'student',
    TEACHER: 'teacher',
    SCHOOL: 'school',
    SUPER_ADMIN: 'superadmin',
    SUB_ADMIN: 'subadmin',
};

// User Statuses
const USER_STATUSES = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    SUSPENDED: 'suspended',
    ACTIVE: 'active',
    BANNED: 'banned',
};

// Exam Types
const EXAM_TYPES = {
    PAST: 'past',
    MODEL: 'model',
    MOCK: 'mock',
    QUIZ: 'quiz',
};

// Exam Statuses
const EXAM_STATUSES = {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ARCHIVED: 'archived',
    PENDING: 'pending',
    REJECTED: 'rejected',
};

// Question Types
const QUESTION_TYPES = {
    MULTIPLE_CHOICE: 'multiple_choice',
    TRUE_FALSE: 'true_false',
    BLANK: 'blank',
    WORK_OUT: 'work_out',
    ESSAY: 'essay',
};

// Material Types
const MATERIAL_TYPES = {
    TEXTBOOK: 'textbook',
    PAST_EXAM: 'past_exam',
    MODEL_EXAM: 'model_exam',
    YOUTUBE: 'youtube',
    PDF: 'pdf',
    NOTE: 'note',
    VIDEO: 'video',
    LINK: 'link',
};

// Departments
const DEPARTMENTS = {
    NATURAL_SCIENCE: 'Natural Science',
    SOCIAL_SCIENCE: 'Social Science',
    BOTH: 'Both',
};

// Grade Levels
const GRADE_LEVELS = [9, 10, 11, 12];

// Pagination
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// File Upload
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

// Cache Keys
const CACHE_KEYS = {
    STUDENT_DASHBOARD: 'student_dashboard',
    TEACHER_DASHBOARD: 'teacher_dashboard',
    ADMIN_DASHBOARD: 'admin_dashboard',
    EXAM_LIST: 'exam_list',
    SUBJECT_LIST: 'subject_list',
    MATERIAL_LIST: 'material_list',
};

// Cache TTL (seconds)
const CACHE_TTL = {
    DASHBOARD: 300,   // 5 minutes
    LIST: 600,        // 10 minutes
    DETAIL: 3600,     // 1 hour
};

// HTTP Status Codes
const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
};

// Error Messages
const ERROR_MESSAGES = {
    // Auth errors
    AUTH_REQUIRED: 'Authentication required',
    INVALID_CREDENTIALS: 'Invalid credentials',
    ACCOUNT_PENDING: 'Account pending approval',
    ACCOUNT_REJECTED: 'Account rejected',
    ACCOUNT_SUSPENDED: 'Account suspended',
    ACCOUNT_BANNED: 'Account banned',

    // User errors
    USER_NOT_FOUND: 'User not found',
    USER_EXISTS: 'User already exists',
    EMAIL_EXISTS: 'Email already exists',
    USERNAME_EXISTS: 'Username already exists',

    // Exam errors
    EXAM_NOT_FOUND: 'Exam not found',
    EXAM_ALREADY_PUBLISHED: 'Exam already published',
    EXAM_NOT_PUBLISHED: 'Exam not published',

    // Permission errors
    ACCESS_DENIED: 'Access denied',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',

    // Validation errors
    INVALID_INPUT: 'Invalid input',
    MISSING_REQUIRED_FIELDS: 'Missing required fields',
    INVALID_FILE_TYPE: 'Invalid file type',
    FILE_TOO_LARGE: 'File too large',
};

module.exports = {
    USER_ROLES,
    USER_STATUSES,
    EXAM_TYPES,
    EXAM_STATUSES,
    QUESTION_TYPES,
    MATERIAL_TYPES,
    DEPARTMENTS,
    GRADE_LEVELS,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    MAX_FILE_SIZE,
    ALLOWED_FILE_TYPES,
    CACHE_KEYS,
    CACHE_TTL,
    HTTP_STATUS,
    ERROR_MESSAGES,
};
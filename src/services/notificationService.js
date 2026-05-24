// backend/src/services/notificationService.js
// Handles both in-app notifications and email notifications

const { sequelize } = require('../config/database');
const { sendNotificationEmail } = require('./emailService');
const User = require('../models/User');

class NotificationService {
    // Send notification to user (creates in-app notification and optionally sends email)
    static async sendNotification(userId, notificationData, sendEmail = true) {
        try {
            // Create in-app notification
            const [notification] = await sequelize.query(`
        INSERT INTO "Notifications" ("userId", title, message, type, metadata, "isRead", "createdAt")
        VALUES ($1, $2, $3, $4, $5::jsonb, false, NOW())
        RETURNING id
      `, {
                bind: [
                    userId,
                    notificationData.title,
                    notificationData.message,
                    notificationData.type || 'info',
                    JSON.stringify(notificationData.metadata || {})
                ]
            });

            console.log(`📢 Notification sent to user ${userId}: ${notificationData.title}`);

            // Send email notification if enabled and user has email
            if (sendEmail) {
                await this.sendEmailNotification(userId, notificationData);
            }

            return { success: true, notificationId: notification[0].id };
        } catch (error) {
            console.error('Error sending notification:', error);
            return { success: false, error: error.message };
        }
    }

    // Send email notification
    static async sendEmailNotification(userId, notificationData) {
        try {
            // Get user details
            const [user] = await sequelize.query(`
        SELECT id, name, email FROM "Users" WHERE id = $1 AND email IS NOT NULL
      `, { bind: [userId] });

            if (!user[0] || !user[0].email) {
                console.log(`User ${userId} has no email, skipping email notification`);
                return { success: false, error: 'No email address' };
            }

            const userEmail = user[0].email;
            const userName = user[0].name || 'User';

            // Prepare email data based on notification type
            let emailData = {
                title: notificationData.title,
                message: notificationData.message,
                url: notificationData.metadata?.url || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/notifications`
            };

            // Add type-specific data
            if (notificationData.metadata) {
                emailData = { ...emailData, ...notificationData.metadata };
            }

            // Send email
            const emailResult = await sendNotificationEmail(
                userEmail,
                userName,
                notificationData.type || 'info',
                emailData
            );

            if (emailResult.success) {
                console.log(`📧 Email notification sent to ${userEmail}`);
            } else {
                console.log(`❌ Failed to send email to ${userEmail}:`, emailResult.error);
            }

            return emailResult;
        } catch (error) {
            console.error('Error sending email notification:', error);
            return { success: false, error: error.message };
        }
    }

    // Send notification to multiple users
    static async sendBulkNotification(userIds, notificationData, sendEmail = true) {
        const results = [];

        for (const userId of userIds) {
            const result = await this.sendNotification(userId, notificationData, sendEmail);
            results.push({ userId, ...result });
        }

        return results;
    }

    // Send notification to all users of a specific role
    static async sendNotificationToRole(role, notificationData, sendEmail = true) {
        try {
            // Get all users with this role
            const [users] = await sequelize.query(`
        SELECT id FROM "Users" WHERE role = $1 AND status = 'active'
      `, { bind: [role] });

            const userIds = users.map(u => u.id);
            return await this.sendBulkNotification(userIds, notificationData, sendEmail);
        } catch (error) {
            console.error(`Error sending notification to role ${role}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Send notification to all students in a specific grade/department
    static async sendNotificationToStudents(gradeLevel, department, notificationData, sendEmail = true) {
        try {
            const [students] = await sequelize.query(`
        SELECT s."userId" FROM "Students" s
        INNER JOIN "Users" u ON s."userId" = u.id
        WHERE s."gradeLevel" = $1 AND s.department = $2 AND u.status = 'active'
      `, { bind: [gradeLevel, department] });

            const userIds = students.map(s => s.userId);
            return await this.sendBulkNotification(userIds, notificationData, sendEmail);
        } catch (error) {
            console.error(`Error sending notification to students:`, error);
            return { success: false, error: error.message };
        }
    }

    // Send notification to all teachers of a specific subject
    static async sendNotificationToTeachers(subject, notificationData, sendEmail = true) {
        try {
            const [teachers] = await sequelize.query(`
        SELECT t."userId" FROM "Teachers" t
        INNER JOIN "Users" u ON t."userId" = u.id
        WHERE t.specialization = $1 AND u.status = 'active'
      `, { bind: [subject] });

            const userIds = teachers.map(t => t.userId);
            return await this.sendBulkNotification(userIds, notificationData, sendEmail);
        } catch (error) {
            console.error(`Error sending notification to teachers of ${subject}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Get user's unread notifications count
    static async getUnreadCount(userId) {
        try {
            const [result] = await sequelize.query(`
        SELECT COUNT(*) as count FROM "Notifications" 
        WHERE "userId" = $1 AND "isRead" = false AND type != 'sent_message'
      `, { bind: [userId] });

            return parseInt(result[0]?.count || 0);
        } catch (error) {
            console.error('Error getting unread count:', error);
            return 0;
        }
    }

    // Get user's notifications
    static async getUserNotifications(userId, limit = 50, offset = 0) {
        try {
            const [notifications] = await sequelize.query(`
        SELECT * FROM "Notifications" 
        WHERE "userId" = $1 AND type != 'sent_message'
        ORDER BY "createdAt" DESC
        LIMIT $2 OFFSET $3
      `, { bind: [userId, limit, offset] });

            const [total] = await sequelize.query(`
        SELECT COUNT(*) as count FROM "Notifications" WHERE "userId" = $1 AND type != 'sent_message'
      `, { bind: [userId] });

            return {
                notifications: notifications || [],
                total: parseInt(total[0]?.count || 0),
                unread: await this.getUnreadCount(userId)
            };
        } catch (error) {
            console.error('Error getting user notifications:', error);
            return { notifications: [], total: 0, unread: 0 };
        }
    }

    // Mark notification as read
    static async markAsRead(userId, notificationId) {
        try {
            await sequelize.query(`
        UPDATE "Notifications" 
        SET "isRead" = true, "updatedAt" = NOW()
        WHERE id = $1 AND "userId" = $2
      `, { bind: [notificationId, userId] });

            return { success: true };
        } catch (error) {
            console.error('Error marking notification as read:', error);
            return { success: false, error: error.message };
        }
    }

    // Mark all notifications as read for user
    static async markAllAsRead(userId) {
        try {
            await sequelize.query(`
        UPDATE "Notifications" 
        SET "isRead" = true, "updatedAt" = NOW()
        WHERE "userId" = $1 AND "isRead" = false
      `, { bind: [userId] });

            return { success: true };
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            return { success: false, error: error.message };
        }
    }

    // Delete notification
    static async deleteNotification(userId, notificationId) {
        try {
            await sequelize.query(`
        DELETE FROM "Notifications" 
        WHERE id = $1 AND "userId" = $2
      `, { bind: [notificationId, userId] });

            return { success: true };
        } catch (error) {
            console.error('Error deleting notification:', error);
            return { success: false, error: error.message };
        }
    }

    // Clear all notifications for user
    static async clearAllNotifications(userId) {
        try {
            await sequelize.query(`
        DELETE FROM "Notifications" WHERE "userId" = $1
      `, { bind: [userId] });

            return { success: true };
        } catch (error) {
            console.error('Error clearing all notifications:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = NotificationService;
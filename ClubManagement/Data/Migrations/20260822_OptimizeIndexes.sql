-- ACEA MMS — indexes and fee schedule (idempotent)
IF OBJECT_ID(N'dbo.Membership_fee_schedule', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Membership_fee_schedule (
        membership_fee_schedule_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        membership_type_id BIGINT NOT NULL,
        joining_fee DECIMAL(18,2) NOT NULL,
        joining_fee_under_30 DECIMAL(18,2) NOT NULL,
        annual_subscription DECIMAL(18,2) NOT NULL,
        effective_date DATE NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_fee_sched_active DEFAULT(1),
        created_at DATETIME2 NOT NULL,
        created_by_user_id BIGINT NULL,
        updated_by_user_id BIGINT NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MApplication_application_no' AND object_id = OBJECT_ID(N'dbo.MApplication'))
    CREATE UNIQUE INDEX UX_MApplication_application_no ON dbo.MApplication(application_no);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MApplication_status' AND object_id = OBJECT_ID(N'dbo.MApplication'))
    CREATE INDEX IX_MApplication_status ON dbo.MApplication(application_status_id, submitted_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MApplication_applicant' AND object_id = OBJECT_ID(N'dbo.MApplication'))
    CREATE INDEX IX_MApplication_applicant ON dbo.MApplication(applicant_profile_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MAccount_membership_no' AND object_id = OBJECT_ID(N'dbo.MAccount'))
    CREATE UNIQUE INDEX UX_MAccount_membership_no ON dbo.MAccount(membership_no);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MAccount_status_type' AND object_id = OBJECT_ID(N'dbo.MAccount'))
    CREATE INDEX IX_MAccount_status_type ON dbo.MAccount(current_member_status_id, membership_type_id) INCLUDE (is_active, is_deleted);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MProfile_email' AND object_id = OBJECT_ID(N'dbo.MProfile'))
    CREATE INDEX IX_MProfile_email ON dbo.MProfile(email);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MProfile_id_passport' AND object_id = OBJECT_ID(N'dbo.MProfile'))
    CREATE INDEX IX_MProfile_id_passport ON dbo.MProfile(id_passport_no);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Subscription_account_year' AND object_id = OBJECT_ID(N'dbo.Subscription'))
    CREATE UNIQUE INDEX UX_Subscription_account_year ON dbo.Subscription(account_id, subscription_year);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MTransaction_date' AND object_id = OBJECT_ID(N'dbo.MTransaction'))
    CREATE INDEX IX_MTransaction_date ON dbo.MTransaction(payment_date DESC) INCLUDE (amount, payment_method_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MTransaction_mpesa' AND object_id = OBJECT_ID(N'dbo.MTransaction'))
    CREATE INDEX IX_MTransaction_mpesa ON dbo.MTransaction(mpesa_code);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MVisit_member_date' AND object_id = OBJECT_ID(N'dbo.MVisit'))
    CREATE INDEX IX_MVisit_member_date ON dbo.MVisit(visiting_profile_id, visit_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MVisit_guest_date' AND object_id = OBJECT_ID(N'dbo.MVisit'))
    CREATE INDEX IX_MVisit_guest_date ON dbo.MVisit(guest_id, visit_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MVisit_current' AND object_id = OBJECT_ID(N'dbo.MVisit'))
    CREATE INDEX IX_MVisit_current ON dbo.MVisit(visiting_profile_id, is_current_flag) WHERE is_current_flag = 1;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Reciprocal_profile_date' AND object_id = OBJECT_ID(N'dbo.Reciprocal_usage'))
    CREATE INDEX IX_Reciprocal_profile_date ON dbo.Reciprocal_usage(profile_id, visit_date);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_User_account_username' AND object_id = OBJECT_ID(N'dbo.User_account'))
    CREATE UNIQUE INDEX UX_User_account_username ON dbo.User_account(username);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Club_setting_key' AND object_id = OBJECT_ID(N'dbo.Club_setting'))
    CREATE UNIQUE INDEX UX_Club_setting_key ON dbo.Club_setting(setting_key);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Audit_log_record' AND object_id = OBJECT_ID(N'dbo.Audit_log'))
    CREATE INDEX IX_Audit_log_record ON dbo.Audit_log(table_name, record_id, changed_at DESC);
GO

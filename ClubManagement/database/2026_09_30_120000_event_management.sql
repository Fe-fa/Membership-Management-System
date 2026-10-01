-- Event management: categories, registrations, and attendance.
-- The application also applies this schema on startup.
IF OBJECT_ID(N'dbo.Event_category', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Event_category (
        event_category_id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        code nvarchar(40) NOT NULL,
        name nvarchar(80) NOT NULL,
        sort_order int NOT NULL CONSTRAINT DF_event_category_sort DEFAULT (0),
        is_active bit NOT NULL CONSTRAINT DF_event_category_active DEFAULT (1),
        created_at datetime2(7) NOT NULL,
        updated_at datetime2(7) NULL,
        CONSTRAINT UQ_Event_category_code UNIQUE (code)
    );
END
GO

IF COL_LENGTH(N'dbo.Club_event', N'status') IS NULL
    ALTER TABLE dbo.Club_event ADD status nvarchar(20) NOT NULL CONSTRAINT DF_club_event_status DEFAULT (N'PUBLISHED');
IF COL_LENGTH(N'dbo.Club_event', N'category_code') IS NULL
    ALTER TABLE dbo.Club_event ADD category_code nvarchar(40) NULL;
IF COL_LENGTH(N'dbo.Club_event', N'image_url') IS NULL
    ALTER TABLE dbo.Club_event ADD image_url nvarchar(500) NULL;
IF COL_LENGTH(N'dbo.Club_event', N'capacity') IS NULL
    ALTER TABLE dbo.Club_event ADD capacity int NULL;
IF COL_LENGTH(N'dbo.Club_event', N'registration_deadline') IS NULL
    ALTER TABLE dbo.Club_event ADD registration_deadline datetime2(7) NULL;
IF COL_LENGTH(N'dbo.Club_event', N'fee') IS NULL
    ALTER TABLE dbo.Club_event ADD fee decimal(12,2) NULL;
IF COL_LENGTH(N'dbo.Club_event', N'require_registration') IS NULL
    ALTER TABLE dbo.Club_event ADD require_registration bit NOT NULL CONSTRAINT DF_club_event_require_reg DEFAULT (0);
IF COL_LENGTH(N'dbo.Club_event', N'require_approval') IS NULL
    ALTER TABLE dbo.Club_event ADD require_approval bit NOT NULL CONSTRAINT DF_club_event_require_approval DEFAULT (0);
IF COL_LENGTH(N'dbo.Club_event', N'allow_guest_registration') IS NULL
    ALTER TABLE dbo.Club_event ADD allow_guest_registration bit NOT NULL CONSTRAINT DF_club_event_allow_guest DEFAULT (0);
IF COL_LENGTH(N'dbo.Club_event', N'updated_at') IS NULL
    ALTER TABLE dbo.Club_event ADD updated_at datetime2(7) NULL;
GO

IF OBJECT_ID(N'dbo.Event_registration', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Event_registration (
        event_registration_id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        club_event_id bigint NOT NULL,
        account_id bigint NOT NULL,
        status nvarchar(20) NOT NULL,
        payment_status nvarchar(20) NOT NULL CONSTRAINT DF_event_reg_payment DEFAULT (N'NOT_REQUIRED'),
        guest_count int NOT NULL CONSTRAINT DF_event_reg_guests DEFAULT (0),
        guest_name nvarchar(120) NULL,
        ticket_code nvarchar(40) NULL,
        registered_at datetime2(7) NOT NULL,
        created_at datetime2(7) NOT NULL,
        updated_at datetime2(7) NULL,
        created_by_user_id bigint NULL,
        CONSTRAINT FK_Event_registration_event FOREIGN KEY (club_event_id) REFERENCES dbo.Club_event (club_event_id),
        CONSTRAINT FK_Event_registration_account FOREIGN KEY (account_id) REFERENCES dbo.MAccount (account_id),
        CONSTRAINT UQ_Event_registration_event_account UNIQUE (club_event_id, account_id)
    );
    CREATE INDEX IX_Event_registration_status ON dbo.Event_registration (status);
END
GO

IF OBJECT_ID(N'dbo.Event_attendance', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Event_attendance (
        event_attendance_id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        club_event_id bigint NOT NULL,
        account_id bigint NOT NULL,
        event_registration_id bigint NULL,
        status nvarchar(20) NOT NULL,
        checked_in_at datetime2(7) NULL,
        created_at datetime2(7) NOT NULL,
        updated_at datetime2(7) NULL,
        CONSTRAINT FK_Event_attendance_event FOREIGN KEY (club_event_id) REFERENCES dbo.Club_event (club_event_id),
        CONSTRAINT FK_Event_attendance_account FOREIGN KEY (account_id) REFERENCES dbo.MAccount (account_id),
        CONSTRAINT FK_Event_attendance_registration FOREIGN KEY (event_registration_id) REFERENCES dbo.Event_registration (event_registration_id),
        CONSTRAINT UQ_Event_attendance_event_account UNIQUE (club_event_id, account_id)
    );
END
GO

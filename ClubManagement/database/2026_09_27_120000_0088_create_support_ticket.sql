-- Baseline schema for dbo.Support_ticket. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Support_ticket', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Support_ticket] (
        [support_ticket_id] bigint IDENTITY(1,1) NOT NULL,
        [tenant_id] bigint NOT NULL CONSTRAINT [DF_support_ticket_tenant] DEFAULT ((0)),
        [ticket_no] nvarchar(30) NOT NULL,
        [subject] nvarchar(200) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [category_role_code] nvarchar(50) NOT NULL,
        [category_email] nvarchar(200) NULL,
        [category_assignee_name] nvarchar(200) NULL,
        [priority] nvarchar(20) NOT NULL CONSTRAINT [DF_support_ticket_priority] DEFAULT (N'NORMAL'),
        [status] nvarchar(20) NOT NULL CONSTRAINT [DF_support_ticket_status] DEFAULT (N'OPEN'),
        [created_by_user_id] bigint NOT NULL,
        [created_by_profile_id] bigint NOT NULL,
        [assigned_user_id] bigint NULL,
        [attachment_file_name] nvarchar(260) NULL,
        [attachment_url] nvarchar(500) NULL,
        [created_at] datetime2(7) NOT NULL,
        [updated_at] datetime2(7) NULL,
        [updated_by_user_id] bigint NULL,
        CONSTRAINT [PK__Support___34FDECE5400CEAD0] PRIMARY KEY ([support_ticket_id])
    );
END
GO

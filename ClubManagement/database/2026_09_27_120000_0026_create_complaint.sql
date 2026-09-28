-- Baseline schema for dbo.Complaint. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Complaint', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Complaint] (
        [complaint_id] bigint IDENTITY(1,1) NOT NULL,
        [complainant_profile_id] bigint NOT NULL,
        [subject] nvarchar(255) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [received_date] date NOT NULL,
        [handled_by_user_id] bigint NULL,
        [status] nvarchar(30) NOT NULL CONSTRAINT [DF__Complaint__statu__5772F790] DEFAULT (N'OPEN'),
        [resolution] nvarchar(MAX) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Complaint__creat__58671BC9] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Complaint] PRIMARY KEY ([complaint_id])
    );
END
GO

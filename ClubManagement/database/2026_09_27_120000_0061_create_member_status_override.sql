-- Baseline schema for dbo.Member_status_override. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_status_override', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_status_override] (
        [member_status_override_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [flag_type] nvarchar(30) NOT NULL,
        [override_value] bit NOT NULL,
        [reason] nvarchar(MAX) NULL,
        [approved_by_profile_id] bigint NULL,
        [effective_date] date NOT NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_st__creat__1C1D2798] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Member_status_override] PRIMARY KEY ([member_status_override_id])
    );
END
GO
